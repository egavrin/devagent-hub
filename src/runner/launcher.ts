import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { buildLaunchArgs } from "./args-builder.js";
import type { LaunchOptions } from "./args-builder.js";
import type { RunnerDescription } from "../workflow/stage-schemas.js";
import type { RunnerProtocol, RunnerCompatResult } from "./protocol.js";
import type { AgentProfile } from "../workflow/config.js";
import { RUNNER_CONTRACT_VERSION } from "./protocol.js";

export interface LaunchResult {
  exitCode: number;
  outputPath: string;
  eventsPath: string;
  output: unknown | null;
  costUsd?: number;
}

export interface LauncherConfig {
  devagentBin: string;
  artifactsDir: string;
  timeout: number; // ms
  provider?: string;
  model?: string;
  maxIterations?: number;
  approvalMode?: string;
  reasoning?: string;
}

/** Cache for describeRunner results — avoids calling the runner multiple times. */
const describeRunnerCache = new Map<string, RunnerDescription | null>();

/**
 * Query the runner for its capabilities via `devagent workflow describe`.
 * Returns null if the runner doesn't support the command.
 * Results are cached per bin string.
 */
export function describeRunner(bin: string): RunnerDescription | null {
  if (describeRunnerCache.has(bin)) {
    return describeRunnerCache.get(bin)!;
  }

  const binParts = bin.split(/\s+/);
  let result: RunnerDescription | null = null;
  try {
    const raw = execFileSync(binParts[0], [...binParts.slice(1), "workflow", "describe"], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    result = JSON.parse(raw) as RunnerDescription;
  } catch {
    result = null;
  }

  describeRunnerCache.set(bin, result);
  return result;
}

/** Clear the describeRunner cache (useful in tests). */
export function clearDescribeRunnerCache(): void {
  describeRunnerCache.clear();
}

/** Convert a RunnerDescription to a full RunnerProtocol. */
export function toRunnerProtocol(desc: RunnerDescription): RunnerProtocol {
  return {
    contractVersion: desc.contractVersion ?? 0,
    commands: {
      describe: true,
      run: true,
      cancel: false,
      health: false,
    },
    phases: desc.supportedPhases,
    approvalModes: desc.supportedApprovalModes,
    reasoningLevels: desc.supportedReasoningLevels,
    providers: desc.availableProviders,
    models: [],
    capabilities: [],
    limits: {},
  };
}

/**
 * Check whether a runner is compatible with what Hub needs.
 * Returns warnings for missing optional features and errors for critical gaps.
 */
export function validateRunnerCompat(desc: RunnerDescription | null): RunnerCompatResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!desc) {
    return {
      compatible: false,
      warnings: [],
      errors: ["Runner does not support 'workflow describe' — cannot verify compatibility."],
      capabilities: {
        contractVersion: 0,
        commands: { describe: false, run: false, cancel: false, health: false },
        phases: [],
        approvalModes: [],
        reasoningLevels: [],
        providers: [],
        models: [],
        capabilities: [],
        limits: {},
      },
    };
  }

  const protocol = toRunnerProtocol(desc);

  // Check contract version
  if (protocol.contractVersion < RUNNER_CONTRACT_VERSION) {
    warnings.push(
      `Runner contract version ${protocol.contractVersion} is older than Hub expects (${RUNNER_CONTRACT_VERSION}).`,
    );
  }

  // Check required phases
  const requiredPhases = ["triage", "plan", "implement", "verify", "review", "repair"];
  for (const phase of requiredPhases) {
    if (!protocol.phases.includes(phase)) {
      errors.push(`Runner is missing required phase: ${phase}`);
    }
  }

  // Check reasoning support (optional)
  if (protocol.reasoningLevels.length === 0) {
    warnings.push("Runner does not advertise reasoning levels — --reasoning flag will be skipped.");
  }

  // Check approval modes
  if (protocol.approvalModes.length === 0) {
    warnings.push("Runner does not advertise approval modes.");
  }

  return {
    compatible: errors.length === 0,
    warnings,
    errors,
    capabilities: protocol,
  };
}

/**
 * Validate that a profile's requested settings are supported by the runner.
 * Returns an array of warning strings (empty if fully compatible).
 */
export function validateProfileAgainstRunner(
  profile: AgentProfile,
  desc: RunnerDescription | null,
): string[] {
  const warnings: string[] = [];
  if (!desc) return ["Cannot validate: runner does not support describe"];

  if (profile.provider && !desc.availableProviders.includes(profile.provider)) {
    warnings.push(`Profile requests provider "${profile.provider}" but runner only supports: ${desc.availableProviders.join(", ")}`);
  }
  if (profile.approval_mode && !desc.supportedApprovalModes.includes(profile.approval_mode)) {
    warnings.push(`Profile requests approval mode "${profile.approval_mode}" but runner supports: ${desc.supportedApprovalModes.join(", ")}`);
  }
  if (profile.reasoning && desc.supportedReasoningLevels.length > 0 && !desc.supportedReasoningLevels.includes(profile.reasoning)) {
    warnings.push(`Profile requests reasoning "${profile.reasoning}" but runner supports: ${desc.supportedReasoningLevels.join(", ")}`);
  }
  return warnings;
}

export class RunLauncher {
  private config: LauncherConfig;

  constructor(config: LauncherConfig) {
    this.config = config;
  }

  launch(params: {
    phase: string;
    repoPath: string;
    runId: string;
    input: unknown;
  }): LaunchResult {
    const { phase, repoPath, runId, input } = params;
    const { devagentBin, artifactsDir, timeout } = this.config;

    // 1. Create run dir: <artifactsDir>/<runId>/
    const runDir = join(artifactsDir, runId);
    mkdirSync(runDir, { recursive: true });

    // 2. Write input to <phase>-input.json
    const inputPath = join(runDir, `${phase}-input.json`);
    writeFileSync(inputPath, JSON.stringify(input, null, 2));

    // 3. Build output/events paths
    const outputPath = join(runDir, `${phase}-output.json`);
    const eventsPath = join(runDir, `${phase}-events.jsonl`);

    // 4. Build args using shared builder (validates phase, approval mode, reasoning)
    const launchOptions: LaunchOptions = {
      provider: this.config.provider,
      model: this.config.model,
      maxIterations: this.config.maxIterations,
      approvalMode: this.config.approvalMode,
      reasoning: this.config.reasoning,
    };

    const args = buildLaunchArgs(
      { phase, repoPath, inputPath, outputPath, eventsPath },
      launchOptions,
    );

    // 5. Execute with execFileSync, capture exit code and stderr
    // Support compound bin like "bun /path/to/index.js"
    const binParts = devagentBin.split(/\s+/);
    const bin = binParts[0];
    const binArgs = [...binParts.slice(1), ...args];

    let exitCode = 0;
    try {
      execFileSync(bin, binArgs, {
        timeout,
        stdio: ["ignore", "pipe", "pipe"],
        cwd: repoPath,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: Buffer | string };
      exitCode = typeof e.status === "number" ? e.status : 1;
      const stderr = e.stderr ? String(e.stderr).trim() : "";
      if (stderr) {
        const stderrPath = join(runDir, `${phase}-stderr.txt`);
        writeFileSync(stderrPath, stderr);
        console.error(`[devagent-hub] ${phase} agent failed (exit ${exitCode}): ${stderr.split("\n")[0]}`);
      }
    }

    // 6. Read output file if exists, parse JSON
    let output: unknown | null = null;
    if (existsSync(outputPath)) {
      try {
        output = JSON.parse(readFileSync(outputPath, "utf-8"));
      } catch {
        output = null;
      }
    }

    return { exitCode, outputPath, eventsPath, output };
  }
}
