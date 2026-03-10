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
  repair_round INTEGER NOT NULL,
  pr_number INTEGER,
  pr_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  branch TEXT NOT NULL
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
    const columns = this.db.prepare("PRAGMA table_info(workflow_instances)").all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("pr_number")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN pr_number INTEGER");
    }
    if (!names.has("pr_url")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN pr_url TEXT");
    }
  }

  upsertProject(project: Project): Project {
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
    return this.db.prepare("SELECT * FROM projects ORDER BY name").all().map((row: any) => ({
      id: row.id,
      name: row.name,
      repoRoot: row.repo_root,
      repoFullName: row.repo_full_name,
      workflowConfigPath: row.workflow_config_path ?? undefined,
      allowedExecutors: JSON.parse(row.allowed_executors_json),
    }));
  }

  getProject(id: string): Project | undefined {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
    return row ? {
      id: row.id,
      name: row.name,
      repoRoot: row.repo_root,
      repoFullName: row.repo_full_name,
      workflowConfigPath: row.workflow_config_path ?? undefined,
      allowedExecutors: JSON.parse(row.allowed_executors_json),
    } : undefined;
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
    ).get(projectId, externalId) as any;
    return row ? {
      id: row.id,
      projectId: row.project_id,
      kind: row.kind,
      externalId: row.external_id,
      title: row.title,
      state: row.state,
      labels: JSON.parse(row.labels_json),
      url: row.url,
    } : undefined;
  }

  listWorkItems(projectId: string): WorkItem[] {
    return this.db.prepare("SELECT * FROM work_items WHERE project_id = ? ORDER BY external_id DESC").all(projectId).map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      kind: row.kind,
      externalId: row.external_id,
      title: row.title,
      state: row.state,
      labels: JSON.parse(row.labels_json),
      url: row.url,
    }));
  }

  getWorkItem(id: string): WorkItem | undefined {
    const row = this.db.prepare("SELECT * FROM work_items WHERE id = ?").get(id) as any;
    return row ? {
      id: row.id,
      projectId: row.project_id,
      kind: row.kind,
      externalId: row.external_id,
      title: row.title,
      state: row.state,
      labels: JSON.parse(row.labels_json),
      url: row.url,
    } : undefined;
  }

  createWorkflowInstance(input: {
    projectId: string;
    workItemId: string;
    stage: WorkflowInstance["stage"];
    status: WorkflowInstance["status"];
    branch: string;
  }): WorkflowInstance {
    const workflow: WorkflowInstance = {
      id: randomUUID(),
      projectId: input.projectId,
      workItemId: input.workItemId,
      stage: input.stage,
      status: input.status,
      repairRound: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    this.db.prepare(`
      INSERT INTO workflow_instances (id, project_id, work_item_id, stage, status, repair_round, pr_number, pr_url, created_at, updated_at, branch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workflow.id,
      workflow.projectId,
      workflow.workItemId,
      workflow.stage,
      workflow.status,
      workflow.repairRound,
      workflow.prNumber ?? null,
      workflow.prUrl ?? null,
      workflow.createdAt,
      workflow.updatedAt,
      input.branch,
    );
    return workflow;
  }

  updateWorkflowInstance(id: string, patch: Partial<WorkflowInstance>): WorkflowInstance {
    const current = this.getWorkflowInstance(id);
    if (!current) throw new Error(`Workflow ${id} not found`);
    const next = { ...current, ...patch, updatedAt: now() };
    this.db.prepare(`
      UPDATE workflow_instances
      SET stage = ?, status = ?, repair_round = ?, pr_number = ?, pr_url = ?, updated_at = ?
      WHERE id = ?
    `).run(next.stage, next.status, next.repairRound, next.prNumber ?? null, next.prUrl ?? null, next.updatedAt, id);
    return next;
  }

  getWorkflowInstance(id: string): WorkflowInstance | undefined {
    const row = this.db.prepare("SELECT * FROM workflow_instances WHERE id = ?").get(id) as any;
    return row ? {
      id: row.id,
      projectId: row.project_id,
      workItemId: row.work_item_id,
      stage: row.stage,
      status: row.status,
      repairRound: row.repair_round,
      prNumber: row.pr_number ?? undefined,
      prUrl: row.pr_url ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } : undefined;
  }

  getWorkflowBranch(id: string): string {
    const row = this.db.prepare("SELECT branch FROM workflow_instances WHERE id = ?").get(id) as any;
    if (!row) throw new Error(`Workflow ${id} not found`);
    return row.branch;
  }

  listWorkflowInstances(): WorkflowInstance[] {
    return this.db.prepare("SELECT * FROM workflow_instances ORDER BY updated_at DESC").all().map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      workItemId: row.work_item_id,
      stage: row.stage,
      status: row.status,
      repairRound: row.repair_round,
      prNumber: row.pr_number ?? undefined,
      prUrl: row.pr_url ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
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
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    return row ? {
      id: row.id,
      workflowInstanceId: row.workflow_instance_id,
      type: row.type,
      status: row.status,
      executorId: row.executor_id,
      runnerId: row.runner_id,
      attemptIds: JSON.parse(row.attempt_ids_json),
    } : undefined;
  }

  listTasks(workflowInstanceId: string): Task[] {
    return this.db.prepare("SELECT * FROM tasks WHERE workflow_instance_id = ? ORDER BY rowid").all(workflowInstanceId).map((row: any) => ({
      id: row.id,
      workflowInstanceId: row.workflow_instance_id,
      type: row.type,
      status: row.status,
      executorId: row.executor_id,
      runnerId: row.runner_id,
      attemptIds: JSON.parse(row.attempt_ids_json),
    }));
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
    const row = this.db.prepare("SELECT * FROM execution_attempts WHERE id = ?").get(id) as any;
    return row ? {
      id: row.id,
      taskId: row.task_id,
      executorId: row.executor_id,
      runnerId: row.runner_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      status: row.status,
      resultPath: row.result_path ?? undefined,
      workspacePath: row.workspace_path ?? undefined,
    } : undefined;
  }

  listAttempts(taskId: string): ExecutionAttempt[] {
    return this.db.prepare("SELECT * FROM execution_attempts WHERE task_id = ? ORDER BY started_at").all(taskId).map((row: any) => ({
      id: row.id,
      taskId: row.task_id,
      executorId: row.executor_id,
      runnerId: row.runner_id,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      status: row.status,
      resultPath: row.result_path ?? undefined,
      workspacePath: row.workspace_path ?? undefined,
    }));
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
    ).get(workflowInstanceId) as any;
    return row ? {
      id: row.id,
      workflowInstanceId: row.workflow_instance_id,
      stage: row.stage,
      status: row.status,
      note: row.note ?? undefined,
    } : undefined;
  }

  updateApproval(id: string, status: Approval["status"], note?: string): Approval {
    this.db.prepare("UPDATE approvals SET status = ?, note = ? WHERE id = ?").run(status, note ?? null, id);
    const row = this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as any;
    return {
      id: row.id,
      workflowInstanceId: row.workflow_instance_id,
      stage: row.stage,
      status: row.status,
      note: row.note ?? undefined,
    };
  }

  recordEvent(taskId: string, event: TaskExecutionEvent): void {
    this.db.prepare("INSERT INTO task_events (task_id, event_json, created_at) VALUES (?, ?, ?)").run(
      taskId,
      JSON.stringify(event),
      now(),
    );
  }

  listEvents(taskId: string): PersistedTaskEvent[] {
    return this.db.prepare("SELECT * FROM task_events WHERE task_id = ? ORDER BY id").all(taskId).map((row: any) => ({
      id: row.id,
      taskId: row.task_id,
      event: JSON.parse(row.event_json),
      createdAt: row.created_at,
    }));
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
    return this.db.prepare("SELECT * FROM task_artifacts WHERE task_id = ? ORDER BY created_at").all(taskId).map((row: any) => ({
      kind: row.kind,
      path: row.path,
      mimeType: row.mime_type ?? undefined,
      createdAt: row.created_at,
    }));
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
    const row = this.db.prepare("SELECT * FROM task_results WHERE task_id = ?").get(taskId) as any;
    return row ? {
      taskId: row.task_id,
      result: JSON.parse(row.result_json),
    } : undefined;
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
    const approvals = this.db.prepare("SELECT * FROM approvals WHERE workflow_instance_id = ? ORDER BY rowid").all(id).map((row: any) => ({
      id: row.id,
      workflowInstanceId: row.workflow_instance_id,
      stage: row.stage,
      status: row.status,
      note: row.note ?? undefined,
    }));
    return { workflow, project, workItem, tasks, attempts, events, artifacts, results, approvals };
  }
}
