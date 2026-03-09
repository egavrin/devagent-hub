import type { LaunchResult } from "./launcher.js";
import type { LauncherFactory } from "./launcher-factory.js";
/**
 * Wraps a LauncherFactory to present a single launcher interface.
 * Routes each launch() call to the correct profile-configured launcher
 * based on the phase name. Drop-in replacement for RunLauncher.
 */
export declare class PhaseDispatchLauncher {
    private factory;
    private streaming;
    constructor(factory: LauncherFactory, options?: {
        streaming?: boolean;
    });
    launch(params: {
        phase: string;
        repoPath: string;
        runId: string;
        input: unknown;
    }): LaunchResult | Promise<LaunchResult>;
}
