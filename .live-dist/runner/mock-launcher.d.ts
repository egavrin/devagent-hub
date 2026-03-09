import type { LaunchResult } from "./launcher.js";
export interface MockPhaseResponse {
    exitCode: number;
    output: unknown;
    costUsd?: number;
}
export declare class MockRunLauncher {
    responses: Map<string, MockPhaseResponse>;
    launches: Array<{
        phase: string;
        runId: string;
        input: unknown;
        repoPath: string;
    }>;
    setResponse(phase: string, response: MockPhaseResponse): void;
    launch(params: {
        phase: string;
        repoPath: string;
        runId: string;
        input: unknown;
    }): LaunchResult;
}
