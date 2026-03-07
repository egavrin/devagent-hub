import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { buildLaunchArgs } from "./args-builder.js";
import type { LaunchOptions } from "./args-builder.js";

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
  reasoning?: string;
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
