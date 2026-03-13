import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  Approval,
  ExecutionAttempt,
  PersistedExecutionResult,
  PersistedTaskEvent,
  PersistedTaskResult,
  Project,
  Repository,
  Reviewable,
  Task,
  WorkItem,
  WorkflowGroup,
  WorkflowBaselineSnapshot,
  WorkflowInstance,
  Workspace,
} from "../canonical/types.js";
import type { ArtifactRef, TaskExecutionEvent, WorkflowTaskType } from "@devagent-sdk/types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo_root TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  workflow_config_path TEXT,
  allowed_executors_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  primary_repository_id TEXT,
  workflow_config_path TEXT,
  allowed_executors_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  name TEXT NOT NULL,
  repo_root TEXT NOT NULL,
  repo_full_name TEXT,
  default_branch TEXT,
  provider TEXT
);

CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT,
  repository_id TEXT,
  kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  labels_json TEXT NOT NULL,
  url TEXT,
  description TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS reviewables (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  repository_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  state TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_instances (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT,
  parent_work_item_id TEXT,
  work_item_id TEXT NOT NULL,
  reviewable_id TEXT,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  status_reason TEXT,
  repair_round INTEGER NOT NULL,
  pr_number INTEGER,
  pr_url TEXT,
  branch TEXT NOT NULL,
  base_branch TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  target_repository_ids_json TEXT,
  superseded_by_workflow_id TEXT,
  archived_at TEXT,
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
  workspace_path TEXT,
  event_log_path TEXT
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

function localTaskUrl(workspaceId: string, externalId: string): string {
  return `local-task://${workspaceId}/${externalId}`;
}

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

type WorkspaceRow = {
  id: string;
  name: string;
  provider: Workspace["provider"];
  primary_repository_id: string | null;
  workflow_config_path: string | null;
  allowed_executors_json: string;
};

type RepositoryRow = {
  id: string;
  workspace_id: string;
  alias: string;
  name: string;
  repo_root: string;
  repo_full_name: string | null;
  default_branch: string | null;
  provider: Repository["provider"] | null;
};

type WorkItemRow = {
  id: string;
  project_id: string;
  workspace_id: string | null;
  repository_id: string | null;
  kind: WorkItem["kind"];
  external_id: string;
  title: string;
  state: WorkItem["state"];
  labels_json: string;
  url: string | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ReviewableRow = {
  id: string;
  workspace_id: string;
  repository_id: string;
  provider: Reviewable["provider"];
  type: Reviewable["type"];
  external_id: string;
  title: string;
  url: string;
  state: string | null;
  created_at: string;
  updated_at: string;
};

type WorkflowInstanceRow = {
  id: string;
  project_id: string;
  workspace_id: string | null;
  parent_work_item_id: string | null;
  work_item_id: string;
  reviewable_id: string | null;
  stage: WorkflowInstance["stage"];
  status: WorkflowInstance["status"];
  status_reason: string | null;
  repair_round: number;
  pr_number: number | null;
  pr_url: string | null;
  branch: string;
  base_branch: string;
  base_sha: string;
  target_repository_ids_json: string | null;
  superseded_by_workflow_id: string | null;
  archived_at: string | null;
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
  event_log_path: string | null;
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

function mapWorkspaceRow(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    primaryRepositoryId: row.primary_repository_id ?? undefined,
    workflowConfigPath: row.workflow_config_path ?? undefined,
    allowedExecutors: JSON.parse(row.allowed_executors_json) as Workspace["allowedExecutors"],
  };
}

function mapRepositoryRow(row: RepositoryRow): Repository {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    alias: row.alias,
    name: row.name,
    repoRoot: row.repo_root,
    repoFullName: row.repo_full_name ?? undefined,
    defaultBranch: row.default_branch ?? undefined,
    provider: row.provider ?? undefined,
  };
}

function mapWorkItemRow(row: WorkItemRow): WorkItem {
  const workspaceId = row.workspace_id ?? row.project_id;
  const normalizedUrl =
    row.kind === "local-task" && (!row.url || row.url.length === 0)
      ? localTaskUrl(workspaceId, row.external_id)
      : row.url ?? undefined;
  return {
    id: row.id,
    workspaceId,
    projectId: row.project_id,
    repositoryId: row.repository_id ?? undefined,
    kind: row.kind,
    externalId: row.external_id,
    title: row.title,
    state: row.state,
    labels: JSON.parse(row.labels_json) as string[],
    url: normalizedUrl,
    description: row.description ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

function mapReviewableRow(row: ReviewableRow): Reviewable {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    repositoryId: row.repository_id,
    provider: row.provider,
    type: row.type,
    externalId: row.external_id,
    title: row.title,
    url: row.url,
    state: row.state ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWorkflowInstanceRow(row: WorkflowInstanceRow): WorkflowInstance {
  return {
    id: row.id,
    workspaceId: row.workspace_id ?? row.project_id,
    projectId: row.project_id,
    parentWorkItemId: row.parent_work_item_id ?? undefined,
    workItemId: row.work_item_id,
    reviewableId: row.reviewable_id ?? undefined,
    stage: row.stage,
    status: row.status,
    statusReason: row.status_reason ?? undefined,
    repairRound: row.repair_round,
    prNumber: row.pr_number ?? undefined,
    prUrl: row.pr_url ?? undefined,
    branch: row.branch,
    baseBranch: row.base_branch,
    baseSha: row.base_sha,
    targetRepositoryIds: row.target_repository_ids_json
      ? JSON.parse(row.target_repository_ids_json) as string[]
      : undefined,
    supersededByWorkflowId: row.superseded_by_workflow_id ?? undefined,
    archivedAt: row.archived_at ?? undefined,
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
    eventLogPath: row.event_log_path ?? undefined,
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
    result: JSON.parse(row.result_json) as PersistedExecutionResult,
  };
}

export class CanonicalStore {
  private readonly db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec(SCHEMA);
    this.ensureWorkItemColumns();
    this.ensureWorkflowColumns();
    this.ensureExecutionAttemptColumns();
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
    if (!names.has("workspace_id")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN workspace_id TEXT");
    }
    if (!names.has("parent_work_item_id")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN parent_work_item_id TEXT");
    }
    if (!names.has("reviewable_id")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN reviewable_id TEXT");
    }
    if (!names.has("target_repository_ids_json")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN target_repository_ids_json TEXT");
    }
    if (!names.has("superseded_by_workflow_id")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN superseded_by_workflow_id TEXT");
    }
    if (!names.has("archived_at")) {
      this.db.exec("ALTER TABLE workflow_instances ADD COLUMN archived_at TEXT");
    }
  }

  private ensureWorkItemColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(work_items)").all() as PragmaColumnRow[];
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("workspace_id")) {
      this.db.exec("ALTER TABLE work_items ADD COLUMN workspace_id TEXT");
    }
    if (!names.has("repository_id")) {
      this.db.exec("ALTER TABLE work_items ADD COLUMN repository_id TEXT");
    }
    if (!names.has("description")) {
      this.db.exec("ALTER TABLE work_items ADD COLUMN description TEXT");
    }
    if (!names.has("created_at")) {
      this.db.exec("ALTER TABLE work_items ADD COLUMN created_at TEXT");
    }
    if (!names.has("updated_at")) {
      this.db.exec("ALTER TABLE work_items ADD COLUMN updated_at TEXT");
    }
    if (!names.has("url")) {
      this.db.exec("ALTER TABLE work_items ADD COLUMN url TEXT");
    }
  }

  private ensureExecutionAttemptColumns(): void {
    const columns = this.db.prepare("PRAGMA table_info(execution_attempts)").all() as PragmaColumnRow[];
    const names = new Set(columns.map((column) => column.name));
    if (!names.has("event_log_path")) {
      try {
        this.db.exec("ALTER TABLE execution_attempts ADD COLUMN event_log_path TEXT");
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("duplicate column name: event_log_path")) {
          throw error;
        }
      }
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

    const primaryRepositoryId = `${project.id}:primary`;
    this.upsertWorkspace({
      id: project.id,
      name: project.name,
      provider: "github",
      primaryRepositoryId,
      workflowConfigPath: project.workflowConfigPath,
      allowedExecutors: project.allowedExecutors,
    });
    this.upsertRepository({
      id: primaryRepositoryId,
      workspaceId: project.id,
      alias: "primary",
      name: project.name,
      repoRoot: project.repoRoot,
      repoFullName: project.repoFullName,
      defaultBranch: "main",
      provider: "github",
    });

    return project;
  }

  listProjects(): Project[] {
    return (this.db.prepare("SELECT * FROM projects ORDER BY name").all() as ProjectRow[]).map(mapProjectRow);
  }

  getProject(id: string): Project | undefined {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? mapProjectRow(row) : undefined;
  }

  upsertWorkspace(workspace: Workspace): Workspace {
    this.db.prepare(`
      INSERT INTO workspaces (id, name, provider, primary_repository_id, workflow_config_path, allowed_executors_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        provider = excluded.provider,
        primary_repository_id = excluded.primary_repository_id,
        workflow_config_path = excluded.workflow_config_path,
        allowed_executors_json = excluded.allowed_executors_json
    `).run(
      workspace.id,
      workspace.name,
      workspace.provider,
      workspace.primaryRepositoryId ?? null,
      workspace.workflowConfigPath ?? null,
      JSON.stringify(workspace.allowedExecutors),
    );
    return workspace;
  }

  listWorkspaces(): Workspace[] {
    return (this.db.prepare("SELECT * FROM workspaces ORDER BY name").all() as WorkspaceRow[]).map(mapWorkspaceRow);
  }

  getWorkspace(id: string): Workspace | undefined {
    const row = this.db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as WorkspaceRow | undefined;
    return row ? mapWorkspaceRow(row) : undefined;
  }

  upsertRepository(repository: Repository): Repository {
    this.db.prepare(`
      INSERT INTO repositories (id, workspace_id, alias, name, repo_root, repo_full_name, default_branch, provider)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        alias = excluded.alias,
        name = excluded.name,
        repo_root = excluded.repo_root,
        repo_full_name = excluded.repo_full_name,
        default_branch = excluded.default_branch,
        provider = excluded.provider
    `).run(
      repository.id,
      repository.workspaceId,
      repository.alias,
      repository.name,
      repository.repoRoot,
      repository.repoFullName ?? null,
      repository.defaultBranch ?? null,
      repository.provider ?? null,
    );
    return repository;
  }

  listRepositories(workspaceId: string): Repository[] {
    return (this.db.prepare("SELECT * FROM repositories WHERE workspace_id = ? ORDER BY alias").all(workspaceId) as RepositoryRow[])
      .map(mapRepositoryRow);
  }

  getRepository(id: string): Repository | undefined {
    const row = this.db.prepare("SELECT * FROM repositories WHERE id = ?").get(id) as RepositoryRow | undefined;
    return row ? mapRepositoryRow(row) : undefined;
  }

  upsertWorkItem(workItem: WorkItem): WorkItem {
    const timestamp = now();
    this.db.prepare(`
      INSERT INTO work_items (
        id, project_id, workspace_id, repository_id, kind, external_id, title, state, labels_json, url, description, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        repository_id = excluded.repository_id,
        title = excluded.title,
        state = excluded.state,
        labels_json = excluded.labels_json,
        url = excluded.url,
        description = excluded.description,
        updated_at = excluded.updated_at
    `).run(
      workItem.id,
      workItem.projectId,
      workItem.workspaceId,
      workItem.repositoryId ?? null,
      workItem.kind,
      workItem.externalId,
      workItem.title,
      workItem.state,
      JSON.stringify(workItem.labels),
      workItem.url ?? null,
      workItem.description ?? null,
      workItem.createdAt ?? timestamp,
      workItem.updatedAt ?? timestamp,
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

  listWorkspaceWorkItems(workspaceId: string): WorkItem[] {
    return (this.db.prepare("SELECT * FROM work_items WHERE workspace_id = ? ORDER BY updated_at DESC, external_id DESC").all(workspaceId) as WorkItemRow[])
      .map(mapWorkItemRow);
  }

  getWorkItem(id: string): WorkItem | undefined {
    const row = this.db.prepare("SELECT * FROM work_items WHERE id = ?").get(id) as WorkItemRow | undefined;
    return row ? mapWorkItemRow(row) : undefined;
  }

  createLocalTask(input: {
    workspaceId: string;
    repositoryId?: string;
    title: string;
    description?: string;
    labels?: string[];
  }): WorkItem {
    const nextId = randomUUID();
    const externalId = `local-${nextId.slice(0, 8)}`;
    return this.upsertWorkItem({
      id: nextId,
      workspaceId: input.workspaceId,
      projectId: input.workspaceId,
      repositoryId: input.repositoryId,
      kind: "local-task",
      externalId,
      title: input.title,
      state: "draft",
      labels: input.labels ?? [],
      url: localTaskUrl(input.workspaceId, externalId),
      description: input.description,
      createdAt: now(),
      updatedAt: now(),
    });
  }

  upsertReviewable(reviewable: Reviewable): Reviewable {
    this.db.prepare(`
      INSERT INTO reviewables (id, workspace_id, repository_id, provider, type, external_id, title, url, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        repository_id = excluded.repository_id,
        provider = excluded.provider,
        type = excluded.type,
        external_id = excluded.external_id,
        title = excluded.title,
        url = excluded.url,
        state = excluded.state,
        updated_at = excluded.updated_at
    `).run(
      reviewable.id,
      reviewable.workspaceId,
      reviewable.repositoryId,
      reviewable.provider,
      reviewable.type,
      reviewable.externalId,
      reviewable.title,
      reviewable.url,
      reviewable.state ?? null,
      reviewable.createdAt,
      reviewable.updatedAt,
    );
    return reviewable;
  }

  listReviewables(workspaceId: string): Reviewable[] {
    return (this.db.prepare("SELECT * FROM reviewables WHERE workspace_id = ? ORDER BY updated_at DESC").all(workspaceId) as ReviewableRow[])
      .map(mapReviewableRow);
  }

  getReviewable(id: string): Reviewable | undefined {
    const row = this.db.prepare("SELECT * FROM reviewables WHERE id = ?").get(id) as ReviewableRow | undefined;
    return row ? mapReviewableRow(row) : undefined;
  }

  createWorkflowInstance(input: {
    projectId: string;
    workspaceId?: string;
    parentWorkItemId?: string;
    workItemId: string;
    reviewableId?: string;
    stage: WorkflowInstance["stage"];
    status: WorkflowInstance["status"];
    branch: string;
    baseBranch: string;
    baseSha: string;
    targetRepositoryIds?: string[];
    baselineSnapshot: WorkflowBaselineSnapshot;
  }): WorkflowInstance {
    const workflow: WorkflowInstance = {
      id: randomUUID(),
      workspaceId: input.workspaceId ?? input.projectId,
      projectId: input.projectId,
      parentWorkItemId: input.parentWorkItemId ?? input.workItemId,
      workItemId: input.workItemId,
      reviewableId: input.reviewableId,
      stage: input.stage,
      status: input.status,
      repairRound: 0,
      branch: input.branch,
      baseBranch: input.baseBranch,
      baseSha: input.baseSha,
      targetRepositoryIds: input.targetRepositoryIds,
      baselineSnapshot: input.baselineSnapshot,
      createdAt: now(),
      updatedAt: now(),
    };
    this.db.prepare(`
      INSERT INTO workflow_instances (
        id, project_id, workspace_id, parent_work_item_id, work_item_id, reviewable_id, stage, status, status_reason, repair_round, pr_number, pr_url,
        branch, base_branch, base_sha, target_repository_ids_json, superseded_by_workflow_id, archived_at, baseline_snapshot_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workflow.id,
      workflow.projectId,
      workflow.workspaceId,
      workflow.parentWorkItemId ?? null,
      workflow.workItemId,
      workflow.reviewableId ?? null,
      workflow.stage,
      workflow.status,
      workflow.statusReason ?? null,
      workflow.repairRound,
      workflow.prNumber ?? null,
      workflow.prUrl ?? null,
      workflow.branch,
      workflow.baseBranch,
      workflow.baseSha,
      workflow.targetRepositoryIds ? JSON.stringify(workflow.targetRepositoryIds) : null,
      workflow.supersededByWorkflowId ?? null,
      workflow.archivedAt ?? null,
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
      SET workspace_id = ?, parent_work_item_id = ?, work_item_id = ?, reviewable_id = ?, stage = ?, status = ?, status_reason = ?, repair_round = ?, pr_number = ?, pr_url = ?, branch = ?, base_branch = ?, base_sha = ?, target_repository_ids_json = ?, superseded_by_workflow_id = ?, archived_at = ?, baseline_snapshot_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.workspaceId,
      next.parentWorkItemId ?? null,
      next.workItemId,
      next.reviewableId ?? null,
      next.stage,
      next.status,
      next.statusReason ?? null,
      next.repairRound,
      next.prNumber ?? null,
      next.prUrl ?? null,
      next.branch,
      next.baseBranch,
      next.baseSha,
      next.targetRepositoryIds ? JSON.stringify(next.targetRepositoryIds) : null,
      next.supersededByWorkflowId ?? null,
      next.archivedAt ?? null,
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

  listWorkflowGroups(): WorkflowGroup[] {
    const workflows = this.listWorkflowInstances().filter((workflow) => !workflow.archivedAt);
    const groups = new Map<string, WorkflowInstance[]>();
    for (const workflow of workflows) {
      const key = workflow.reviewableId
        ? `reviewable:${workflow.reviewableId}`
        : `work-item:${workflow.parentWorkItemId ?? workflow.workItemId}`;
      const existing = groups.get(key) ?? [];
      existing.push(workflow);
      groups.set(key, existing);
    }

    return [...groups.entries()].map(([key, grouped]) => {
      const workflowsByRecency = [...grouped].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const sample = workflowsByRecency[0]!;
      return {
        key,
        workItemId: sample.parentWorkItemId ?? sample.workItemId,
        reviewableId: sample.reviewableId,
        latestWorkflow: workflowsByRecency[0]!,
        workflows: workflowsByRecency,
      };
    });
  }

  archiveWorkflow(id: string): WorkflowInstance {
    return this.updateWorkflowInstance(id, { archivedAt: now() });
  }

  supersedeWorkflow(id: string, supersededByWorkflowId: string): WorkflowInstance {
    return this.updateWorkflowInstance(id, { supersededByWorkflowId });
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
    eventLogPath?: string;
  }): ExecutionAttempt {
    const attempt: ExecutionAttempt = {
      id: randomUUID(),
      taskId: input.taskId,
      executorId: input.executorId,
      runnerId: input.runnerId,
      startedAt: now(),
      status: "running",
      workspacePath: input.workspacePath,
      eventLogPath: input.eventLogPath,
    };
    this.db.prepare(`
      INSERT INTO execution_attempts (id, task_id, executor_id, runner_id, started_at, status, workspace_path, event_log_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(attempt.id, attempt.taskId, attempt.executorId, attempt.runnerId, attempt.startedAt, attempt.status, attempt.workspacePath ?? null, attempt.eventLogPath ?? null);
    return attempt;
  }

  updateAttemptMetadata(id: string, patch: { workspacePath?: string; eventLogPath?: string }): ExecutionAttempt {
    const current = this.getAttempt(id);
    if (!current) throw new Error(`Attempt ${id} not found`);
    const next: ExecutionAttempt = {
      ...current,
      workspacePath: patch.workspacePath ?? current.workspacePath,
      eventLogPath: patch.eventLogPath ?? current.eventLogPath,
    };
    this.db.prepare(`
      UPDATE execution_attempts SET workspace_path = ?, event_log_path = ? WHERE id = ?
    `).run(next.workspacePath ?? null, next.eventLogPath ?? null, id);
    return next;
  }

  finishAttempt(id: string, result: { status: ExecutionAttempt["status"]; resultPath?: string; workspacePath?: string; eventLogPath?: string }): ExecutionAttempt {
    const current = this.getAttempt(id);
    if (!current) throw new Error(`Attempt ${id} not found`);
    const next: ExecutionAttempt = {
      ...current,
      status: result.status,
      resultPath: result.resultPath,
      workspacePath: result.workspacePath ?? current.workspacePath,
      eventLogPath: result.eventLogPath ?? current.eventLogPath,
      finishedAt: now(),
    };
    this.db.prepare(`
      UPDATE execution_attempts SET status = ?, result_path = ?, workspace_path = ?, event_log_path = ?, finished_at = ? WHERE id = ?
    `).run(next.status, next.resultPath ?? null, next.workspacePath ?? null, next.eventLogPath ?? null, next.finishedAt, id);
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

  recordResult(taskId: string, result: PersistedExecutionResult): void {
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
    workspace: Workspace;
    repositories: Repository[];
    workItem: WorkItem;
    reviewable?: Reviewable;
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
    const workspace = this.getWorkspace(workflow.workspaceId);
    const workItem = this.getWorkItem(workflow.workItemId);
    const reviewable = workflow.reviewableId ? this.getReviewable(workflow.reviewableId) : undefined;
    if (!project || !workspace || !workItem) {
      throw new Error(`Workflow ${id} is missing related records`);
    }
    const repositories = this.listRepositories(workspace.id);
    const tasks = this.listTasks(id);
    const attempts = tasks.flatMap((task) => this.listAttempts(task.id));
    const events = tasks.flatMap((task) => this.listEvents(task.id));
    const artifacts = tasks.flatMap((task) => this.listArtifacts(task.id));
    const results = tasks
      .map((task) => this.getTaskResult(task.id))
      .filter((result): result is PersistedTaskResult => result !== undefined);
    const approvals = (this.db.prepare("SELECT * FROM approvals WHERE workflow_instance_id = ? ORDER BY rowid").all(id) as ApprovalRow[]).map(mapApprovalRow);
    return { workflow, project, workspace, repositories, workItem, reviewable, tasks, attempts, events, artifacts, results, approvals };
  }
}
