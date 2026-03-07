import type { WorkflowConfig, AgentProfile, SelectionPolicy } from "../workflow/config.js";
import type { LauncherConfig } from "./launcher.js";
import type { RunnerAdapter, RunnerCapabilities } from "./runner-adapter.js";
import { RunLauncher, describeRunner } from "./launcher.js";
import { StreamingLauncher } from "./streaming-launcher.js";
import { StreamingLauncherAdapter } from "./streaming-adapter.js";
import { OpenCodeRunner } from "./opencode-runner.js";
import { ClaudeRunner } from "./claude-runner.js";
import { CodexRunner } from "./codex-runner.js";
import type { ProcessRegistry } from "./process-registry.js";
import { join } from "node:path";
import { homedir } from "node:os";

/** Known runner types resolved from profile bin names. */
const OPENCODE_BINS = new Set(["opencode"]);
const CLAUDE_BINS = new Set(["claude"]);
const CODEX_BINS = new Set(["codex", "npx @openai/codex"]);

/**
 * Creates phase-configured launchers based on WorkflowConfig profiles and roles.
 * Each phase gets a launcher with settings from its assigned profile,
 * merged over the base runner config.
 *
 * Supports multiple runner types:
 * - DevAgent (default): uses RunLauncher / StreamingLauncher
 * - OpenCode: uses OpenCodeRunner adapter
 */
export class LauncherFactory {
  private config: WorkflowConfig;
  private syncCache = new Map<string, RunnerAdapter>();
  private streamingCache = new Map<string, RunnerAdapter>();
  private artifactsDir: string;
  private registry?: ProcessRegistry;

  constructor(config: WorkflowConfig, registry?: ProcessRegistry) {
    this.config = config;
    this.registry = registry;
    this.artifactsDir = join(homedir(), ".config", "devagent-hub", "artifacts");
  }

  /**
   * Resolve profile name for a phase, considering selection policy.
   * Policy rules are evaluated top-to-bottom; first match wins.
   * Falls back to roles config, then "default".
   */
  resolveProfile(phase: string, context?: { complexity?: string }): string {
    const policy = this.config.selection_policy;
    if (policy) {
      for (const rule of policy.rules) {
        const phaseMatch = rule.phases.includes("*") || rule.phases.includes(phase);
        if (!phaseMatch) continue;

        if (rule.complexity) {
          if (!context?.complexity || !rule.complexity.includes(context.complexity)) continue;
        }

        if (this.config.profiles[rule.profile]) {
          return rule.profile;
        }
      }
    }

    return this.config.roles[phase] ?? "default";
  }

  /** Get a sync launcher configured for the given phase. */
  getLauncher(phase: string, context?: { complexity?: string }): RunnerAdapter {
    const profileName = this.resolveProfile(phase, context);
    if (this.syncCache.has(profileName)) return this.syncCache.get(profileName)!;

    const profile = this.config.profiles[profileName] ?? {};
    const adapter = this.createAdapter(profile);
    this.syncCache.set(profileName, adapter);
    return adapter;
  }

  /** Get a streaming launcher configured for the given phase. Requires registry for devagent. */
  getStreamingLauncher(phase: string, context?: { complexity?: string }): RunnerAdapter {
    const profileName = this.resolveProfile(phase, context);
    if (this.streamingCache.has(profileName)) return this.streamingCache.get(profileName)!;

    const profile = this.config.profiles[profileName] ?? {};
    const adapter = this.createStreamingAdapter(profile);
    this.streamingCache.set(profileName, adapter);
    return adapter;
  }

  /** Describe all unique runner binaries across profiles. */
  describeRunners(): Map<string, RunnerCapabilities | null> {
    const results = new Map<string, RunnerCapabilities | null>();

    // Collect unique adapters across all roles
    const seen = new Set<string>();
    for (const profileName of Object.values(this.config.roles)) {
      if (seen.has(profileName)) continue;
      seen.add(profileName);

      const profile = this.config.profiles[profileName] ?? {};
      const bin = profile.bin ?? this.config.runner.bin ?? "devagent";

      if (results.has(bin)) continue;

      if (this.isOpenCodeBin(bin)) {
        const adapter = new OpenCodeRunner({ bin, model: this.resolveModel(profile) });
        results.set(bin, adapter.describe());
      } else if (this.isClaudeBin(bin)) {
        const adapter = new ClaudeRunner({ bin });
        results.set(bin, adapter.describe());
      } else if (this.isCodexBin(bin)) {
        const adapter = new CodexRunner({ bin });
        results.set(bin, adapter.describe());
      } else {
        results.set(bin, describeRunner(bin));
      }
    }

    // Also include base runner
    const baseBin = this.config.runner.bin ?? "devagent";
    if (!results.has(baseBin)) {
      results.set(baseBin, describeRunner(baseBin));
    }

    return results;
  }

  /** Create a sync adapter for the given profile. */
  private createAdapter(profile: AgentProfile): RunnerAdapter {
    const bin = profile.bin ?? this.config.runner.bin ?? "devagent";

    if (this.isOpenCodeBin(bin)) {
      return new OpenCodeRunner({
        bin,
        model: this.resolveModel(profile),
        artifactsDir: this.artifactsDir,
        env: this.resolveEnv(profile),
      });
    }

    if (this.isClaudeBin(bin)) {
      return new ClaudeRunner({
        bin,
        model: profile.model,
        artifactsDir: this.artifactsDir,
      });
    }

    if (this.isCodexBin(bin)) {
      return new CodexRunner({
        bin,
        model: profile.model,
        artifactsDir: this.artifactsDir,
        env: this.resolveEnv(profile),
      });
    }

    // Default: DevAgent RunLauncher wrapped as RunnerAdapter
    const merged = this.mergeDevagentConfig(profile);
    return new DevAgentAdapter(new RunLauncher(merged));
  }

  /** Create a streaming adapter for the given profile. */
  private createStreamingAdapter(profile: AgentProfile): RunnerAdapter {
    const bin = profile.bin ?? this.config.runner.bin ?? "devagent";

    if (this.isOpenCodeBin(bin) || this.isClaudeBin(bin) || this.isCodexBin(bin)) {
      // External runners don't support streaming — use sync adapter
      return this.createAdapter(profile);
    }

    if (!this.registry) throw new Error("LauncherFactory requires a ProcessRegistry for streaming launchers");

    const merged = this.mergeDevagentConfig(profile);
    const streaming = new StreamingLauncher({ ...merged, registry: this.registry });
    return new DevAgentAdapter(new StreamingLauncherAdapter(streaming));
  }

  private isOpenCodeBin(bin: string): boolean {
    const base = bin.split(/\s+/)[0].split("/").pop() ?? "";
    return OPENCODE_BINS.has(base);
  }

  private isClaudeBin(bin: string): boolean {
    const base = bin.split(/\s+/)[0].split("/").pop() ?? "";
    return CLAUDE_BINS.has(base);
  }

  private isCodexBin(bin: string): boolean {
    // Handle both "codex" and "npx @openai/codex"
    return CODEX_BINS.has(bin) || CODEX_BINS.has(bin.split(/\s+/)[0].split("/").pop() ?? "");
  }

  private resolveModel(profile: AgentProfile): string {
    const provider = profile.provider ?? this.config.runner.provider ?? "deepseek";
    const model = profile.model ?? this.config.runner.model ?? "deepseek-chat";
    return `${provider}/${model}`;
  }

  private resolveEnv(profile: AgentProfile): Record<string, string> | undefined {
    // Pass through any provider-specific env vars
    const env: Record<string, string> = {};
    const provider = profile.provider ?? this.config.runner.provider;
    if (provider === "deepseek" && process.env.DEEPSEEK_API_KEY) {
      env.DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    }
    return Object.keys(env).length > 0 ? env : undefined;
  }

  private mergeDevagentConfig(profile: AgentProfile): LauncherConfig {
    const base = this.config.runner;
    return {
      devagentBin: profile.bin ?? base.bin ?? "devagent",
      artifactsDir: this.artifactsDir,
      timeout: 15 * 60 * 1000,
      provider: profile.provider ?? base.provider,
      model: profile.model ?? base.model,
      maxIterations: profile.max_iterations ?? base.max_iterations,
      approvalMode: profile.approval_mode ?? base.approval_mode,
      reasoning: profile.reasoning ?? base.reasoning,
    };
  }
}

/**
 * Wraps DevAgent's RunLauncher/StreamingLauncherAdapter as a RunnerAdapter.
 */
class DevAgentAdapter implements RunnerAdapter {
  readonly id = "devagent";
  readonly name = "DevAgent";
  private launcher: { launch: (params: { phase: string; repoPath: string; runId: string; input: unknown }) => any };

  constructor(launcher: RunLauncher | StreamingLauncherAdapter) {
    this.launcher = launcher;
  }

  launch(params: { phase: string; repoPath: string; runId: string; input: unknown }) {
    return this.launcher.launch(params);
  }

  describe(): RunnerCapabilities | null {
    return null; // Handled by describeRunner(bin) at factory level
  }
}
