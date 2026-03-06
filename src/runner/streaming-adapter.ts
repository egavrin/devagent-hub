import { existsSync, readFileSync } from "fs";
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

    const { exitCode } = await managedProcess.onExit;

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
