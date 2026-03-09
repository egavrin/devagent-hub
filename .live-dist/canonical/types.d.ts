import type { TaskExecutionEvent, TaskExecutionResult, WorkflowTaskType } from "@devagent-sdk/types";
export type Project = {
    id: string;
    name: string;
    repoRoot: string;
    repoFullName: string;
    workflowConfigPath?: string;
    allowedExecutors: string[];
};
export type WorkItem = {
    id: string;
    projectId: string;
    kind: "github-issue";
    externalId: string;
    title: string;
    state: "open" | "closed";
    labels: string[];
    url: string;
};
export type WorkflowInstance = {
    id: string;
    projectId: string;
    workItemId: string;
    stage: WorkflowTaskType | "done";
    status: "queued" | "running" | "waiting_approval" | "failed" | "completed" | "cancelled";
    repairRound: number;
    createdAt: string;
    updatedAt: string;
};
export type Task = {
    id: string;
    workflowInstanceId: string;
    type: WorkflowTaskType;
    status: "queued" | "running" | "waiting_approval" | "failed" | "completed" | "cancelled";
    executorId: string;
    runnerId: string;
    attemptIds: string[];
};
export type ExecutionAttempt = {
    id: string;
    taskId: string;
    executorId: string;
    runnerId: string;
    startedAt: string;
    finishedAt?: string;
    status: "running" | "success" | "failed" | "cancelled";
    resultPath?: string;
    workspacePath?: string;
};
export type Approval = {
    id: string;
    workflowInstanceId: string;
    stage: WorkflowTaskType;
    status: "pending" | "approved" | "rejected";
    note?: string;
};
export type PersistedTaskEvent = {
    id: number;
    taskId: string;
    event: TaskExecutionEvent;
    createdAt: string;
};
export type PersistedTaskResult = {
    taskId: string;
    result: TaskExecutionResult;
};
