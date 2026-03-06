import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import type { LaunchResult } from "./launcher.js";
import type { StreamingLauncher } from "./streaming-launcher.js";

export class StreamingLauncherAdapter {
  private launcher: StreamingLauncher;

  constructor(launcher: StreamingLauncher) {
    this.launcher = launcher;
  }

  async launch(params: {
    phase: string;
    repoPath: string;
    runId: string;
    input: unknown;
  }): Promise<LaunchResult> {
    const { managedProcess, outputPath, eventsPath } = this.launcher.launch(params);

    // Capture stderr for debugging failed runs
    const stderrChunks: string[] = [];
    managedProcess.on("stderr", (data: string) => {
      stderrChunks.push(data);
    });

    const { exitCode } = await managedProcess.onExit;

    if (exitCode !== 0 && stderrChunks.length > 0) {
      const stderrPath = join(dirname(outputPath), `${params.phase}-stderr.txt`);
      writeFileSync(stderrPath, stderrChunks.join(""));
    }

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
