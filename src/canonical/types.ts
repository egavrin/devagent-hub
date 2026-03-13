import type {
  TaskExecutionEvent,
  TaskExecutionResult,
  WorkflowTaskType,
  WorkspaceProvider,
} from "@devagent-sdk/types";

export type RepairOutcome = {
  unresolvedCommentCount: number;
  ciFailureCount: number;
  pushedCommit: boolean;
  pushedSha?: string;
};

export type PersistedExecutionResult = TaskExecutionResult & {
  repairOutcome?: RepairOutcome;
};

export type BaselineSystemSnapshot = {
  protocolVersion: string;
  sdkSha: string;
  runnerSha: string;
  devagentSha: string;
  hubSha: string;
};

export type WorkflowBaselineSnapshot = {
  targetBranch: string;
  targetBaseSha: string;
  system: BaselineSystemSnapshot;
};

export type Project = {
  id: string;
  name: string;
  repoRoot: string;
  repoFullName: string;
  workflowConfigPath?: string;
  allowedExecutors: string[];
};

export type Workspace = {
  id: string;
  name: string;
  provider: WorkspaceProvider;
  primaryRepositoryId?: string;
  workflowConfigPath?: string;
  allowedExecutors: string[];
};

export type Repository = {
  id: string;
  workspaceId: string;
  alias: string;
  name: string;
  repoRoot: string;
  repoFullName?: string;
  defaultBranch?: string;
  provider?: WorkspaceProvider;
};

export type WorkItem = {
  id: string;
  workspaceId: string;
  projectId: string;
  repositoryId?: string;
  kind: "github-issue" | "local-task";
  externalId: string;
  title: string;
  state: "open" | "closed" | "draft";
  labels: string[];
  url?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Reviewable = {
  id: string;
  workspaceId: string;
  repositoryId: string;
  provider: "github";
  type: "github-pr";
  externalId: string;
  title: string;
  url: string;
  state?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowInstance = {
  id: string;
  workspaceId: string;
  projectId: string;
  parentWorkItemId?: string;
  workItemId: string;
  reviewableId?: string;
  stage: WorkflowTaskType | "done";
  status: "queued" | "running" | "waiting_approval" | "failed" | "completed" | "cancelled";
  statusReason?: string;
  repairRound: number;
  prNumber?: number;
  prUrl?: string;
  branch: string;
  baseBranch: string;
  baseSha: string;
  targetRepositoryIds?: string[];
  supersededByWorkflowId?: string;
  archivedAt?: string;
  baselineSnapshot: WorkflowBaselineSnapshot;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowGroup = {
  key: string;
  workItemId?: string;
  reviewableId?: string;
  latestWorkflow: WorkflowInstance;
  workflows: WorkflowInstance[];
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
  eventLogPath?: string;
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
  result: PersistedExecutionResult;
};
