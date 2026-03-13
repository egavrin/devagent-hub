import type { TaskExecutionEvent, TaskExecutionRequest, TaskExecutionResult } from "@devagent-sdk/types";

export interface RunnerClient {
  startTask(request: TaskExecutionRequest): Promise<{ runId: string }>;
  subscribe(runId: string, onEvent: (event: TaskExecutionEvent) => void): Promise<void>;
  cancel(runId: string): Promise<void>;
  awaitResult(runId: string): Promise<TaskExecutionResult>;
  inspect(runId: string): Promise<{ workspacePath: string; resultPath: string; eventLogPath: string }>;
  cleanupRun(runId: string): Promise<void>;
}
