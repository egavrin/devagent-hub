import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  Approval,
  ExecutionAttempt,
  PersistedTaskEvent,
  PersistedTaskResult,
  Project,
  Task,
  WorkItem,
  WorkflowBaselineSnapshot,
  WorkflowInstance,
} from "../canonical/types.js";
import type { ArtifactRef, TaskExecutionEvent, TaskExecutionResult, WorkflowTaskType } from "@devagent-sdk/types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_root TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  workflow_config_path TEXT,
  allowed_executors_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  labels_json TEXT NOT NULL,
  url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  status_reason TEXT,
  repair_round INTEGER NOT NULL,
  pr_number INTEGER,
  pr_url TEXT,
  branch TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  baseline_snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workflow_instance_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  executor_id TEXT NOT NULL,
  runner_id TEXT NOT NULL,
  attempt_ids_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_attempts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  executor_id TEXT NOT NULL,
  runner_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  result_path TEXT,
  workspace_path TEXT
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  workflow_instance_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_artifacts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  path TEXT NOT NULL,
  mime_type TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_results (
  task_id TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

function now(): string {
  return new Date().toISOString();
}

function serializeBaselineSnapshot(snapshot: WorkflowBaselineSnapshot): string {
  return JSON.stringify(snapshot);
}

function deserializeBaselineSnapshot(raw: string): WorkflowBaselineSnapshot {
  return JSON.parse(raw) as WorkflowBaselineSnapshot;
}

export class ProjectRegistrationConflictError extends Error {
  constructor(
    readonly repoFullName: string,
    readonly existingRepoRoot: string,
    readonly attemptedRepoRoot: string,
  ) {
    super(
      `Project "${repoFullName}" is already registered at "${existingRepoRoot}". ` +
      `Refusing to overwrite it with "${attemptedRepoRoot}". Remove the existing registration or use a single local clone for this GitHub repo.`,
    );
    this.name = "ProjectRegistrationConflictError";
  }
}

type PragmaColumnRow = {
  name: string;
};

type ProjectRow = {
  id: string;
  name: string;
  repo_root: string;
  repo_full_name: string;
  workflow_config_path: string | null;
  allowed_executors_json: string;
};

type WorkItemRow = {
  id: string;
  project_id: string;
  kind: WorkItem["kind"];
  external_id: string;
  title: string;
  state: WorkItem["state"];
  labels_json: string;
  url: string;
};

type WorkflowInstanceRow = {
  id: string;
  project_id: string;
  work_item_id: string;
  stage: WorkflowInstance["stage"];
  status: WorkflowInstance["status"];
  status_reason: string | null;
  repair_round: number;
  pr_number: number | null;
  pr_url: string | null;
  branch: string;
  base_branch: string;
  base_sha: string;
  baseline_snapshot_json: string;
  created_at: string;
  updated_at: string;
};

type WorkflowBranchRow = {
  branch: string;
};

type TaskRow = {
  id: string;
  workflow_instance_id: string;
  type: WorkflowTaskType;
  status: Task["status"];
  executor_id: string;
  runner_id: string;
  attempt_ids_json: string;
};

type ExecutionAttemptRow = {
  id: string;
  task_id: string;
  executor_id: string;
  runner_id: string;
  started_at: string;
  finished_at: string | null;
  status: ExecutionAttempt["status"];
  result_path: string | null;
  workspace_path: string | null;
};

type ApprovalRow = {
  id: string;
  workflow_instance_id: string;
  stage: WorkflowTaskType;
  status: Approval["status"];
  note: string | null;
};

type TaskEventRow = {
  id: number;
  task_id: string;
  event_json: string;
  created_at: string;
};

type TaskArtifactRow = {
  kind: ArtifactRef["kind"];
  path: string;
  mime_type: string | null;
  created_at: string;
};

type TaskResultRow = {
  task_id: string;
  result_json: string;
};

function mapProjectRow(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    repoRoot: row.repo_root,
    repoFullName: row.repo_full_name,
    workflowConfigPath: row.workflow_config_path ?? undefined,
    allowedExecutors: JSON.parse(row.allowed_executors_json) as Project["allowedExecutors"],
  };
}

function mapWorkItemRow(row: WorkItemRow): WorkItem {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    externalId: row.external_id,
    title: row.title,
    state: row.state,
    labels: JSON.parse(row.labels_json) as string[],
    url: row.url,
  };
}

function mapWorkflowInstanceRow(row: WorkflowInstanceRow): WorkflowInstance {
  return {
    id: row.id,
    projectId: row.project_id,
    workItemId: row.work_item_id,
    stage: row.stage,
    status: row.status,
    statusReason: row.status_reason ?? undefined,
    repairRound: row.repair_round,
    prNumber: row.pr_number ?? undefined,
    prUrl: row.pr_url ?? undefined,
    branch: row.branch,
    baseBranch: row.base_branch,
    baseSha: row.base_sha,
    baselineSnapshot: deserializeBaselineSnapshot(row.baseline_snapshot_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    workflowInstanceId: row.workflow_instance_id,
    type: row.type,
    status: row.status,
    executorId: row.executor_id,
    runnerId: row.runner_id,
    attemptIds: JSON.parse(row.attempt_ids_json) as string[],
  };
}

function mapExecutionAttemptRow(row: ExecutionAttemptRow): ExecutionAttempt {
  return {
    id: row.id,
    taskId: row.task_id,
    executorId: row.executor_id,
    runnerId: row.runner_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    status: row.status,
    resultPath: row.result_path ?? undefined,
    workspacePath: row.workspace_path ?? undefined,
  };
}

function mapApprovalRow(row: ApprovalRow): Approval {
  return {
    id: row.id,
    workflowInstanceId: row.workflow_instance_id,
    stage: row.stage,
    status: row.status,
    note: row.note ?? undefined,
  };
}

function mapTaskEventRow(row: TaskEventRow): PersistedTaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    event: JSON.parse(row.event_json) as TaskExecutionEvent,
    createdAt: row.created_at,
  };
}

function mapTaskArtifactRow(row: TaskArtifactRow): ArtifactRef {
  return {
    kind: row.kind,
    path: row.path,
    mimeType: row.mime_type ?? undefined,
    createdAt: row.created_at,
  };
}

function mapTaskResultRow(row: TaskResultRow): PersistedTaskResult {
  return {
    taskId: row.task_id,
    result: JSON.parse(row.result_json) as TaskExecutionResult,
  };
}

export class CanonicalStore {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec(SCHEMA);
    this.ensureWorkflowColumns();
  }

  close(): void {
    this.db.close();
  }

  private ensureWorkflowColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(workflow_instances)").all() as PragmaColumnRow[];
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("status_reason")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN status_reason TEXT");
    }
    if (!names.has("pr_number")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN pr_number INTEGER");
    }
    if (!names.has("pr_url")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN pr_url TEXT");
    }
    if (!names.has("branch")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN branch TEXT NOT NULL DEFAULT 'devagent/workflow/unknown'");
    }
    if (!names.has("base_branch")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN base_branch TEXT NOT NULL DEFAULT 'main'");
    }
    if (!names.has("base_sha")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN base_sha TEXT NOT NULL DEFAULT ''");
    }
    if (!names.has("baseline_snapshot_json")) {
      const fallback: WorkflowBaselineSnapshot = {
        targetBranch: "main",
        targetBaseSha: "",
        system: {
          protocolVersion: "0.1",
          sdkSha: "",
          runnerSha: "",
          devagentSha: "",
          hubSha: "",
        },
      };
      this.db.exec(
        `ALTER TABLE workflow_instances ADD COLUMN baseline_snapshot_json TEXT NOT NULL DEFAULT '${serializeBaselineSnapshot(fallback).replace(/'/g, "''")}'`,
      );
    }
  }

  upsertProject(project: Project): Project {
    const existing = this.getProject(project.id);
    if (existing && existing.repoRoot !== project.repoRoot) {
      throw new ProjectRegistrationConflictError(
        project.repoFullName,
        existing.repoRoot,
        project.repoRoot,
      );
    }

    this.db.prepare(`
      INSERT INTO projects (id, name, repo_root, repo_full_name, workflow_config_path, allowed_executors_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        repo_root = excluded.repo_root,
        repo_full_name = excluded.repo_full_name,
        workflow_config_path = excluded.workflow_config_path,
        allowed_executors_json = excluded.allowed_executors_json
    `).run(
      project.id,
      project.name,
      project.repoRoot,
      project.repoFullName,
      project.workflowConfigPath ?? null,
      JSON.stringify(project.allowedExecutors),
    );
    return project;
  }

  listProjects(): Project[] {
    return (this.db.prepare("SELECT * FROM projects ORDER BY name").all() as ProjectRow[]).map(mapProjectRow);
  }

  getProject(id: string): Project | undefined {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? mapProjectRow(row) : undefined;
  }

  upsertWorkItem(workItem: WorkItem): WorkItem {
    this.db.prepare(`
      INSERT INTO work_items (id, project_id, kind, external_id, title, state, labels_json, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        state = excluded.state,
        labels_json = excluded.labels_json,
        url = excluded.url
    `).run(
      workItem.id,
      workItem.projectId,
      workItem.kind,
      workItem.externalId,
      workItem.title,
      workItem.state,
      JSON.stringify(workItem.labels),
      workItem.url,
    );
    return workItem;
  }

  getWorkItemByExternalId(projectId: string, externalId: string): WorkItem | undefined {
    const row = this.db.prepare(
      "SELECT * FROM work_items WHERE project_id = ? AND external_id = ? LIMIT 1",
    ).get(projectId, externalId) as WorkItemRow | undefined;
    return row ? mapWorkItemRow(row) : undefined;
  }

  listWorkItems(projectId: string): WorkItem[] {
    return (this.db.prepare("SELECT * FROM work_items WHERE project_id = ? ORDER BY external_id DESC").all(projectId) as WorkItemRow[]).map(mapWorkItemRow);
  }

  getWorkItem(id: string): WorkItem | undefined {
    const row = this.db.prepare("SELECT * FROM work_items WHERE id = ?").get(id) as WorkItemRow | undefined;
    return row ? mapWorkItemRow(row) : undefined;
  }

  createWorkflowInstance(input: {
    projectId: string;
    workItemId: string;
    stage: WorkflowInstance["stage"];
    status: WorkflowInstance["status"];
    branch: string;
    baseBranch: string;
    baseSha: string;
    baselineSnapshot: WorkflowBaselineSnapshot;
  }): WorkflowInstance {
    const workflow: WorkflowInstance = {
      id: randomUUID(),
      projectId: input.projectId,
      workItemId: input.workItemId,
      stage: input.stage,
      status: input.status,
      repairRound: 0,
      branch: input.branch,
      baseBranch: input.baseBranch,
      baseSha: input.baseSha,
      baselineSnapshot: input.baselineSnapshot,
      createdAt: now(),
      updatedAt: now(),
    };
    this.db.prepare(`
      INSERT INTO workflow_instances (
        id, project_id, work_item_id, stage, status, status_reason, repair_round, pr_number, pr_url,
        branch, base_branch, base_sha, baseline_snapshot_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workflow.id,
      workflow.projectId,
      workflow.workItemId,
      workflow.stage,
      workflow.status,
      workflow.statusReason ?? null,
      workflow.repairRound,
      workflow.prNumber ?? null,
      workflow.prUrl ?? null,
      workflow.branch,
      workflow.baseBranch,
      workflow.baseSha,
      serializeBaselineSnapshot(workflow.baselineSnapshot),
      workflow.createdAt,
      workflow.updatedAt,
    );
    return workflow;
  }

  updateWorkflowInstance(id: string, patch: Partial<WorkflowInstance>): WorkflowInstance {
    const current = this.getWorkflowInstance(id);
    if (!current) throw new Error(`Workflow ${id} not found`);
    const next = { ...current, ...patch, updatedAt: now() };
    this.db.prepare(`
      UPDATE workflow_instances
      SET stage = ?, status = ?, status_reason = ?, repair_round = ?, pr_number = ?, pr_url = ?, branch = ?, base_branch = ?, base_sha = ?, baseline_snapshot_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.stage,
      next.status,
      next.statusReason ?? null,
      next.repairRound,
      next.prNumber ?? null,
      next.prUrl ?? null,
      next.branch,
      next.baseBranch,
      next.baseSha,
      serializeBaselineSnapshot(next.baselineSnapshot),
      next.updatedAt,
      id,
    );
    return next;
  }

  getWorkflowInstance(id: string): WorkflowInstance | undefined {
    const row = this.db.prepare("SELECT * FROM workflow_instances WHERE id = ?").get(id) as WorkflowInstanceRow | undefined;
    return row ? mapWorkflowInstanceRow(row) : undefined;
  }

  getWorkflowBranch(id: string): string {
    const row = this.db.prepare("SELECT branch FROM workflow_instances WHERE id = ?").get(id) as WorkflowBranchRow | undefined;
    if (!row) throw new Error(`Workflow ${id} not found`);
    return row.branch;
  }

  listWorkflowInstances(): WorkflowInstance[] {
    return (this.db.prepare("SELECT * FROM workflow_instances ORDER BY updated_at DESC").all() as WorkflowInstanceRow[]).map(mapWorkflowInstanceRow);
  }

  createTask(input: {
    workflowInstanceId: string;
    type: WorkflowTaskType;
    status: Task["status"];
    executorId: string;
    runnerId: string;
  }): Task {
    const task: Task = {
      id: randomUUID(),
      workflowInstanceId: input.workflowInstanceId,
      type: input.type,
      status: input.status,
      executorId: input.executorId,
      runnerId: input.runnerId,
      attemptIds: [],
    };
    this.db.prepare(`
      INSERT INTO tasks (id, workflow_instance_id, type, status, executor_id, runner_id, attempt_ids_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(task.id, task.workflowInstanceId, task.type, task.status, task.executorId, task.runnerId, "[]");
    return task;
  }

  updateTask(id: string, patch: Partial<Task>): Task {
    const current = this.getTask(id);
    if (!current) throw new Error(`Task ${id} not found`);
    const next = { ...current, ...patch };
    this.db.prepare(`
      UPDATE tasks SET status = ?, executor_id = ?, runner_id = ?, attempt_ids_json = ? WHERE id = ?
    `).run(next.status, next.executorId, next.runnerId, JSON.stringify(next.attemptIds), id);
    return next;
  }

  getTask(id: string): Task | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    return row ? mapTaskRow(row) : undefined;
  }

  listTasks(workflowInstanceId: string): Task[] {
    return (this.db.prepare("SELECT * FROM tasks WHERE workflow_instance_id = ? ORDER BY rowid").all(workflowInstanceId) as TaskRow[]).map(mapTaskRow);
  }

  createAttempt(input: {
    taskId: string;
    executorId: string;
    runnerId: string;
    workspacePath?: string;
  }): ExecutionAttempt {
    const attempt: ExecutionAttempt = {
      id: randomUUID(),
      taskId: input.taskId,
      executorId: input.executorId,
      runnerId: input.runnerId,
      startedAt: now(),
      status: "running",
      workspacePath: input.workspacePath,
    };
    this.db.prepare(`
      INSERT INTO execution_attempts (id, task_id, executor_id, runner_id, started_at, status, workspace_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(attempt.id, attempt.taskId, attempt.executorId, attempt.runnerId, attempt.startedAt, attempt.status, attempt.workspacePath ?? null);
    return attempt;
  }

  finishAttempt(id: string, result: { status: ExecutionAttempt["status"]; resultPath?: string; workspacePath?: string }): ExecutionAttempt {
    const current = this.getAttempt(id);
    if (!current) throw new Error(`Attempt ${id} not found`);
    const next: ExecutionAttempt = {
      ...current,
      status: result.status,
      resultPath: result.resultPath,
      workspacePath: result.workspacePath ?? current.workspacePath,
      finishedAt: now(),
    };
    this.db.prepare(`
      UPDATE execution_attempts SET status = ?, result_path = ?, workspace_path = ?, finished_at = ? WHERE id = ?
    `).run(next.status, next.resultPath ?? null, next.workspacePath ?? null, next.finishedAt, id);
    return next;
  }

  getAttempt(id: string): ExecutionAttempt | undefined {
    const row = this.db.prepare("SELECT * FROM execution_attempts WHERE id = ?").get(id) as ExecutionAttemptRow | undefined;
    return row ? mapExecutionAttemptRow(row) : undefined;
  }

  listAttempts(taskId: string): ExecutionAttempt[] {
    return (this.db.prepare("SELECT * FROM execution_attempts WHERE task_id = ? ORDER BY started_at").all(taskId) as ExecutionAttemptRow[]).map(mapExecutionAttemptRow);
  }

  createApproval(input: { workflowInstanceId: string; stage: WorkflowTaskType; status?: Approval["status"]; note?: string }): Approval {
    const approval: Approval = {
      id: randomUUID(),
      workflowInstanceId: input.workflowInstanceId,
      stage: input.stage,
      status: input.status ?? "pending",
      note: input.note,
    };
    this.db.prepare(`
      INSERT INTO approvals (id, workflow_instance_id, stage, status, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(approval.id, approval.workflowInstanceId, approval.stage, approval.status, approval.note ?? null);
    return approval;
  }

  getPendingApproval(workflowInstanceId: string): Approval | undefined {
    const row = this.db.prepare(
      "SELECT * FROM approvals WHERE workflow_instance_id = ? AND status = 'pending' ORDER BY rowid DESC LIMIT 1",
    ).get(workflowInstanceId) as ApprovalRow | undefined;
    return row ? mapApprovalRow(row) : undefined;
  }

  updateApproval(id: string, status: Approval["status"], note?: string): Approval {
    this.db.prepare("UPDATE approvals SET status = ?, note = ? WHERE id = ?").run(status, note ?? null, id);
    const row = this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as ApprovalRow | undefined;
    if (!row) throw new Error(`Approval ${id} not found after update`);
    return mapApprovalRow(row);
  }

  recordEvent(taskId: string, event: TaskExecutionEvent): void {
    this.db.prepare("INSERT INTO task_events (task_id, event_json, created_at) VALUES (?, ?, ?)").run(
      taskId,
      JSON.stringify(event),
      now(),
    );
  }

  listEvents(taskId: string): PersistedTaskEvent[] {
    return (this.db.prepare("SELECT * FROM task_events WHERE task_id = ? ORDER BY id").all(taskId) as TaskEventRow[]).map(mapTaskEventRow);
  }

  recordArtifacts(taskId: string, artifacts: ArtifactRef[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO task_artifacts (id, task_id, kind, path, mime_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const artifact of artifacts) {
      stmt.run(randomUUID(), taskId, artifact.kind, artifact.path, artifact.mimeType ?? null, artifact.createdAt);
    }
  }

  listArtifacts(taskId: string): ArtifactRef[] {
    return (this.db.prepare("SELECT kind, path, mime_type, created_at FROM task_artifacts WHERE task_id = ? ORDER BY created_at").all(taskId) as TaskArtifactRow[]).map(mapTaskArtifactRow);
  }

  recordResult(taskId: string, result: TaskExecutionResult): void {
    this.db.prepare(`
      INSERT INTO task_results (task_id, result_json, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        result_json = excluded.result_json,
        created_at = excluded.created_at
    `).run(taskId, JSON.stringify(result), now());
  }

  getTaskResult(taskId: string): PersistedTaskResult | undefined {
    const row = this.db.prepare("SELECT task_id, result_json FROM task_results WHERE task_id = ?").get(taskId) as TaskResultRow | undefined;
    return row ? mapTaskResultRow(row) : undefined;
  }

  getWorkflowSnapshot(id: string): {
    workflow: WorkflowInstance;
    project: Project;
    workItem: WorkItem;
    tasks: Task[];
    attempts: ExecutionAttempt[];
    events: PersistedTaskEvent[];
    artifacts: ArtifactRef[];
    results: PersistedTaskResult[];
    approvals: Approval[];
  } {
    const workflow = this.getWorkflowInstance(id);
    if (!workflow) throw new Error(`Workflow ${id} not found`);
    const project = this.getProject(workflow.projectId);
    const workItem = this.getWorkItem(workflow.workItemId);
    if (!project || !workItem) {
      throw new Error(`Workflow ${id} is missing related records`);
    }
    const tasks = this.listTasks(id);
    const attempts = tasks.flatMap((task) => this.listAttempts(task.id));
    const events = tasks.flatMap((task) => this.listEvents(task.id));
    const artifacts = tasks.flatMap((task) => this.listArtifacts(task.id));
    const results = tasks
      .map((task) => this.getTaskResult(task.id))
      .filter((result): result is PersistedTaskResult => result !== undefined);
    const approvals = (this.db.prepare("SELECT * FROM approvals WHERE workflow_instance_id = ? ORDER BY rowid").all(id) as ApprovalRow[]).map(mapApprovalRow);
    return { workflow, project, workItem, tasks, attempts, events, artifacts, results, approvals };
  }
}
