import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { LauncherConfig } from "./launcher.js";
import type { ManagedProcess } from "./managed-process.js";
import type { ProcessRegistry } from "./process-registry.js";

export interface StreamingLauncherConfig extends LauncherConfig {
  registry: ProcessRegistry;
}

export interface StreamingLaunchResult {
  managedProcess: ManagedProcess;
  outputPath: string;
  eventsPath: string;
}

export class StreamingLauncher {
  private config: StreamingLauncherConfig;

  constructor(config: StreamingLauncherConfig) {
    this.config = config;
  }

  launch(params: {
    phase: string;
    repoPath: string;
    runId: string;
    input: unknown;
  }): StreamingLaunchResult {
    const { phase, repoPath, runId, input } = params;
    const { devagentBin, artifactsDir, timeout } = this.config;

    const runDir = join(artifactsDir, runId);
    mkdirSync(runDir, { recursive: true });

    const inputPath = join(runDir, `${phase}-input.json`);
    writeFileSync(inputPath, JSON.stringify(input, null, 2));

    const outputPath = join(runDir, `${phase}-output.json`);
    const eventsPath = join(runDir, `${phase}-events.jsonl`);

    const args: string[] = [
      "workflow", "run",
      "--phase", phase,
      "--input", inputPath,
      "--output", outputPath,
      "--events", eventsPath,
      "--repo", repoPath,
    ];

    if (this.config.provider) args.push("--provider", this.config.provider);
    if (this.config.model) args.push("--model", this.config.model);
    if (this.config.maxIterations !== undefined && this.config.maxIterations > 0) {
      args.push("--max-iterations", String(this.config.maxIterations));
    } else if (this.config.maxIterations === 0) {
      args.push("--max-iterations", "999999");
    }
    if (this.config.approvalMode) args.push("--approval", this.config.approvalMode);
    if (this.config.reasoning) args.push("--reasoning", this.config.reasoning);

    const managedProcess = this.config.registry.spawn({
      id: `${runId}-${phase}`,
      phase,
      bin: devagentBin,
      args,
      cwd: repoPath,
      timeout,
    });

    return { managedProcess, outputPath, eventsPath };
  }
}
