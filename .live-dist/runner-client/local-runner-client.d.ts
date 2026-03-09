import type { TaskExecutionEvent, TaskExecutionRequest, TaskExecutionResult } from "@devagent-sdk/types";
export declare class LocalRunnerClient {
    private readonly runner;
    constructor(devagentCliPath?: string);
    startTask(request: TaskExecutionRequest): Promise<{
        runId: string;
    }>;
    subscribe(runId: string, onEvent: (event: TaskExecutionEvent) => void): Promise<void>;
    cancel(runId: string): Promise<void>;
    awaitResult(runId: string): Promise<TaskExecutionResult>;
    inspect(runId: string): Promise<{
        workspacePath: string;
        resultPath: string;
    }>;
    cleanupRun(runId: string): Promise<void>;
}
