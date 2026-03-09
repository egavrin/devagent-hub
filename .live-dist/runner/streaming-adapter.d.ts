import type { LaunchResult } from "./launcher.js";
import type { StreamingLauncher } from "./streaming-launcher.js";
export declare class StreamingLauncherAdapter {
    private launcher;
    constructor(launcher: StreamingLauncher);
    launch(params: {
        phase: string;
        repoPath: string;
        runId: string;
        input: unknown;
    }): Promise<LaunchResult>;
}
