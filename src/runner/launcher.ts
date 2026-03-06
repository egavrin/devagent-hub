import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface LaunchResult {
  exitCode: number;
  outputPath: string;
  eventsPath: string;
  output: unknown | null;
}

export interface LauncherConfig {
  devagentBin: string;
  artifactsDir: string;
  timeout: number; // ms
  provider?: string;
  model?: string;
  maxIterations?: number;
  approvalMode?: string;
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

    // 4. Build args array for devagent workflow run
    const args: string[] = [
      "workflow",
      "run",
      "--phase",
      phase,
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--events",
      eventsPath,
      "--repo",
      repoPath,
    ];

    if (this.config.provider) {
      args.push("--provider", this.config.provider);
    }
    if (this.config.model) {
      args.push("--model", this.config.model);
    }
    if (this.config.maxIterations !== undefined) {
      args.push("--max-iterations", String(this.config.maxIterations));
    }
    if (this.config.approvalMode) {
      args.push("--approval-mode", this.config.approvalMode);
    }

    // 5. Execute with execFileSync, capture exit code and stderr
    let exitCode = 0;
    try {
      execFileSync(devagentBin, args, {
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
