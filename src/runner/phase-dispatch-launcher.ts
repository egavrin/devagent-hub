import type { LaunchResult } from "./launcher.js";
import type { LauncherFactory } from "./launcher-factory.js";

/**
 * Wraps a LauncherFactory to present a single launcher interface.
 * Routes each launch() call to the correct profile-configured launcher
 * based on the phase name. Drop-in replacement for RunLauncher.
 */
export class PhaseDispatchLauncher {
  private factory: LauncherFactory;
  private streaming: boolean;

  constructor(factory: LauncherFactory, options?: { streaming?: boolean }) {
    this.factory = factory;
    this.streaming = options?.streaming ?? false;
  }

  launch(params: {
    phase: string;
    repoPath: string;
    runId: string;
    input: unknown;
  }): LaunchResult | Promise<LaunchResult> {
    if (this.streaming) {
      return this.factory.getStreamingLauncher(params.phase).launch(params);
    }
    return this.factory.getLauncher(params.phase).launch(params);
  }
}
