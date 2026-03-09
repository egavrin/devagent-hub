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
export declare class StreamingLauncher {
    private config;
    constructor(config: StreamingLauncherConfig);
    launch(params: {
        phase: string;
        repoPath: string;
        runId: string;
        input: unknown;
    }): StreamingLaunchResult;
}
