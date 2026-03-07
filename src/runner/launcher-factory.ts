import type { WorkflowConfig, AgentProfile } from "../workflow/config.js";
import type { LauncherConfig } from "./launcher.js";
import { RunLauncher, describeRunner } from "./launcher.js";
import { StreamingLauncher } from "./streaming-launcher.js";
import { StreamingLauncherAdapter } from "./streaming-adapter.js";
import type { ProcessRegistry } from "./process-registry.js";
import type { RunnerDescription } from "../workflow/stage-schemas.js";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Creates phase-configured launchers based on WorkflowConfig profiles and roles.
 * Each phase gets a launcher with settings from its assigned profile,
 * merged over the base runner config.
 */
export class LauncherFactory {
  private config: WorkflowConfig;
  private syncCache = new Map<string, RunLauncher>();
  private streamingCache = new Map<string, StreamingLauncherAdapter>();
  private artifactsDir: string;
  private registry?: ProcessRegistry;

  constructor(config: WorkflowConfig, registry?: ProcessRegistry) {
    this.config = config;
    this.registry = registry;
    this.artifactsDir = join(homedir(), ".config", "devagent-hub", "artifacts");
  }

  /** Get a sync launcher configured for the given phase. */
  getLauncher(phase: string): RunLauncher {
    const profileName = this.config.roles[phase] ?? "default";
    if (this.syncCache.has(profileName)) return this.syncCache.get(profileName)!;

    const profile = this.config.profiles[profileName] ?? {};
    const merged = this.mergeConfig(profile);
    const launcher = new RunLauncher(merged);
    this.syncCache.set(profileName, launcher);
    return launcher;
  }

  /** Get a streaming launcher configured for the given phase. Requires registry. */
  getStreamingLauncher(phase: string): StreamingLauncherAdapter {
    if (!this.registry) throw new Error("LauncherFactory requires a ProcessRegistry for streaming launchers");

    const profileName = this.config.roles[phase] ?? "default";
    if (this.streamingCache.has(profileName)) return this.streamingCache.get(profileName)!;

    const profile = this.config.profiles[profileName] ?? {};
    const merged = this.mergeConfig(profile);
    const streaming = new StreamingLauncher({ ...merged, registry: this.registry });
    const adapter = new StreamingLauncherAdapter(streaming);
    this.streamingCache.set(profileName, adapter);
    return adapter;
  }

  /** Describe all unique runner binaries across profiles. */
  describeRunners(): Map<string, RunnerDescription | null> {
    const bins = new Set<string>();
    bins.add(this.config.runner.bin ?? "devagent");
    for (const profile of Object.values(this.config.profiles)) {
      if (profile.bin) bins.add(profile.bin);
    }
    const results = new Map<string, RunnerDescription | null>();
    for (const bin of bins) {
      results.set(bin, describeRunner(bin));
    }
    return results;
  }

  private mergeConfig(profile: AgentProfile): LauncherConfig {
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
