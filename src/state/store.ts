import { Database } from "bun:sqlite";
import type {
  WorkflowRun,
  WorkflowStatus,
  SourceType,
  WorkflowMode,
  AgentRun,
  StatusTransition,
  Artifact,
  ArtifactType,
  ApprovalRequest,
  ApprovalAction,
} from "./types.js";
import { assertTransition } from "../workflow/state-machine.js";

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  issue_number INTEGER NOT NULL,
  issue_url TEXT NOT NULL,
  repo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  source_type TEXT NOT NULL DEFAULT 'issue',
  mode TEXT NOT NULL DEFAULT 'assisted',
  runner_id TEXT,
  agent_profile TEXT,
  blocked_reason TEXT,
  next_action TEXT,
  branch TEXT,
  pr_number INTEGER,
  pr_url TEXT,
  worktree_path TEXT,
  current_phase TEXT,
  repair_round INTEGER NOT NULL DEFAULT 0,
  requested_model TEXT,
  actual_provider TEXT,
  actual_model TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL,
  finished_at TEXT,
  input_path TEXT,
  output_path TEXT,
  events_path TEXT,
  iterations INTEGER,
  cost_usd REAL,
  runner_id TEXT,
  executor_kind TEXT,
  profile TEXT,
  triggered_by TEXT,
  stderr_path TEXT,
  stdout_path TEXT,
  exit_reason TEXT,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
);

CREATE TABLE IF NOT EXISTS status_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_run_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  reason TEXT NOT NULL,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  agent_run_id TEXT,
  type TEXT NOT NULL,
  phase TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  file_path TEXT,
  created_at TEXT NOT NULL,
  verdict TEXT,
  blocking_count INTEGER,
  confidence REAL,
  warning_count INTEGER,
  risk_level TEXT,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id),
  FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  action TEXT,
  summary TEXT NOT NULL DEFAULT '',
  reviewer_comment TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  severity TEXT,
  recommended_action TEXT,
  requested_by TEXT,
  reviewer_run_id TEXT,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(id)
);
`;

interface WorkflowRunRow {
  id: string;
  issue_number: number;
  issue_url: string;
  repo: string;
  status: string;
  source_type: string;
  mode: string;
  runner_id: string | null;
  agent_profile: string | null;
  blocked_reason: string | null;
  next_action: string | null;
  branch: string | null;
  pr_number: number | null;
  pr_url: string | null;
  worktree_path: string | null;
  current_phase: string | null;
  repair_round: number;
  requested_model: string | null;
  actual_provider: string | null;
  actual_model: string | null;
  created_at: string;
  updated_at: string;
  metadata: string;
}

interface AgentRunRow {
  id: string;
  workflow_run_id: string;
  phase: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  input_path: string | null;
  output_path: string | null;
  events_path: string | null;
  iterations: number | null;
  cost_usd: number | null;
  runner_id: string | null;
  executor_kind: string | null;
  profile: string | null;
  triggered_by: string | null;
  stderr_path: string | null;
  stdout_path: string | null;
  exit_reason: string | null;
}

interface TransitionRow {
  from_status: string;
  to_status: string;
  timestamp: string;
  reason: string;
}

interface ArtifactRow {
  id: string;
  workflow_run_id: string;
  agent_run_id: string | null;
  type: string;
  phase: string;
  summary: string;
  data: string;
  file_path: string | null;
  created_at: string;
  verdict: string | null;
  blocking_count: number | null;
  confidence: number | null;
  warning_count: number | null;
  risk_level: string | null;
}

interface ApprovalRequestRow {
  id: string;
  workflow_run_id: string;
  phase: string;
  action: string | null;
  summary: string;
  reviewer_comment: string | null;
  resolved_at: string | null;
  created_at: string;
  severity: string | null;
  recommended_action: string | null;
  requested_by: string | null;
  reviewer_run_id: string | null;
}

function rowToArtifact(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    workflowRunId: row.workflow_run_id,
    agentRunId: row.agent_run_id,
    type: row.type as ArtifactType,
    phase: row.phase,
    summary: row.summary,
    data: JSON.parse(row.data),
    filePath: row.file_path,
    createdAt: row.created_at,
    verdict: row.verdict ?? null,
    blockingCount: row.blocking_count ?? null,
    confidence: row.confidence ?? null,
    warningCount: row.warning_count ?? null,
    riskLevel: row.risk_level ?? null,
  };
}

function rowToApprovalRequest(row: ApprovalRequestRow): ApprovalRequest {
  return {
    id: row.id,
    workflowRunId: row.workflow_run_id,
    phase: row.phase,
    action: row.action as ApprovalAction | null,
    summary: row.summary,
    reviewerComment: row.reviewer_comment,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    severity: (row.severity as ApprovalRequest["severity"]) ?? null,
    recommendedAction: row.recommended_action ?? null,
    requestedBy: row.requested_by ?? null,
    reviewerRunId: row.reviewer_run_id ?? null,
  };
}

function rowToWorkflowRun(row: WorkflowRunRow): WorkflowRun {
  return {
    id: row.id,
    issueNumber: row.issue_number,
    issueUrl: row.issue_url,
    repo: row.repo,
    status: row.status as WorkflowStatus,
    sourceType: (row.source_type ?? "issue") as SourceType,
    mode: (row.mode ?? "assisted") as WorkflowMode,
    runnerId: row.runner_id ?? null,
    agentProfile: row.agent_profile ?? null,
    blockedReason: row.blocked_reason ?? null,
    nextAction: row.next_action ?? null,
    branch: row.branch,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    worktreePath: row.worktree_path,
    currentPhase: row.current_phase,
    repairRound: row.repair_round,
    requestedModel: row.requested_model ?? null,
    actualProvider: row.actual_provider ?? null,
    actualModel: row.actual_model ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: JSON.parse(row.metadata),
  };
}

function rowToAgentRun(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    workflowRunId: row.workflow_run_id,
    phase: row.phase,
    status: row.status as AgentRun["status"],
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    inputPath: row.input_path,
    outputPath: row.output_path,
    eventsPath: row.events_path,
    iterations: row.iterations,
    costUsd: row.cost_usd,
    runnerId: row.runner_id ?? null,
    executorKind: (row.executor_kind as AgentRun["executorKind"]) ?? null,
    profile: row.profile ?? null,
    triggeredBy: (row.triggered_by as AgentRun["triggeredBy"]) ?? null,
    stderrPath: row.stderr_path ?? null,
    stdoutPath: row.stdout_path ?? null,
    exitReason: row.exit_reason ?? null,
  };
}

export class StateStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(MIGRATIONS);
    this.migrate();
  }

  private migrate(): void {
    // Add source_type and mode columns if missing (v2 migration)
    const cols = this.db.prepare("PRAGMA table_info(workflow_runs)").all() as Array<{ name: string }>;
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has("source_type")) {
      this.db.exec("ALTER TABLE workflow_runs ADD COLUMN source_type TEXT NOT NULL DEFAULT 'issue'");
    }
    if (!colNames.has("mode")) {
      this.db.exec("ALTER TABLE workflow_runs ADD COLUMN mode TEXT NOT NULL DEFAULT 'assisted'");
    }
    if (!colNames.has("runner_id")) {
      this.db.exec("ALTER TABLE workflow_runs ADD COLUMN runner_id TEXT");
    }
    if (!colNames.has("agent_profile")) {
      this.db.exec("ALTER TABLE workflow_runs ADD COLUMN agent_profile TEXT");
    }
    if (!colNames.has("blocked_reason")) {
      this.db.exec("ALTER TABLE workflow_runs ADD COLUMN blocked_reason TEXT");
    }
    if (!colNames.has("next_action")) {
      this.db.exec("ALTER TABLE workflow_runs ADD COLUMN next_action TEXT");
    }
    if (!colNames.has("requested_model")) {
      this.db.exec("ALTER TABLE workflow_runs ADD COLUMN requested_model TEXT");
    }
    if (!colNames.has("actual_provider")) {
      this.db.exec("ALTER TABLE workflow_runs ADD COLUMN actual_provider TEXT");
    }
    if (!colNames.has("actual_model")) {
      this.db.exec("ALTER TABLE workflow_runs ADD COLUMN actual_model TEXT");
    }

    // Add new columns to agent_runs if missing
    const arCols = this.db.prepare("PRAGMA table_info(agent_runs)").all() as Array<{ name: string }>;
    const arColNames = new Set(arCols.map((c) => c.name));
    if (!arColNames.has("runner_id")) {
      this.db.exec("ALTER TABLE agent_runs ADD COLUMN runner_id TEXT");
    }
    if (!arColNames.has("executor_kind")) {
      this.db.exec("ALTER TABLE agent_runs ADD COLUMN executor_kind TEXT");
    }
    if (!arColNames.has("profile")) {
      this.db.exec("ALTER TABLE agent_runs ADD COLUMN profile TEXT");
    }
    if (!arColNames.has("triggered_by")) {
      this.db.exec("ALTER TABLE agent_runs ADD COLUMN triggered_by TEXT");
    }
    if (!arColNames.has("stderr_path")) {
      this.db.exec("ALTER TABLE agent_runs ADD COLUMN stderr_path TEXT");
    }
    if (!arColNames.has("stdout_path")) {
      this.db.exec("ALTER TABLE agent_runs ADD COLUMN stdout_path TEXT");
    }
    if (!arColNames.has("exit_reason")) {
      this.db.exec("ALTER TABLE agent_runs ADD COLUMN exit_reason TEXT");
    }

    // Add new columns to artifacts if missing
    const artCols = this.db.prepare("PRAGMA table_info(artifacts)").all() as Array<{ name: string }>;
    const artColNames = new Set(artCols.map((c) => c.name));
    if (!artColNames.has("verdict")) {
      this.db.exec("ALTER TABLE artifacts ADD COLUMN verdict TEXT");
    }
    if (!artColNames.has("blocking_count")) {
      this.db.exec("ALTER TABLE artifacts ADD COLUMN blocking_count INTEGER");
    }
    if (!artColNames.has("confidence")) {
      this.db.exec("ALTER TABLE artifacts ADD COLUMN confidence REAL");
    }
    if (!artColNames.has("warning_count")) {
      this.db.exec("ALTER TABLE artifacts ADD COLUMN warning_count INTEGER");
    }
    if (!artColNames.has("risk_level")) {
      this.db.exec("ALTER TABLE artifacts ADD COLUMN risk_level TEXT");
    }

    // Add new columns to approval_requests if missing
    const apCols = this.db.prepare("PRAGMA table_info(approval_requests)").all() as Array<{ name: string }>;
    const apColNames = new Set(apCols.map((c) => c.name));
    if (!apColNames.has("severity")) {
      this.db.exec("ALTER TABLE approval_requests ADD COLUMN severity TEXT");
    }
    if (!apColNames.has("recommended_action")) {
      this.db.exec("ALTER TABLE approval_requests ADD COLUMN recommended_action TEXT");
    }
    if (!apColNames.has("requested_by")) {
      this.db.exec("ALTER TABLE approval_requests ADD COLUMN requested_by TEXT");
    }
    if (!apColNames.has("reviewer_run_id")) {
      this.db.exec("ALTER TABLE approval_requests ADD COLUMN reviewer_run_id TEXT");
    }
  }

  createWorkflowRun(opts: {
    issueNumber: number;
    issueUrl: string;
    repo: string;
    sourceType?: SourceType;
    mode?: WorkflowMode;
    metadata?: Record<string, unknown>;
  }): WorkflowRun {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const metadata = JSON.stringify(opts.metadata ?? {});
    const sourceType = opts.sourceType ?? "issue";
    const mode = opts.mode ?? "assisted";

    this.db
      .prepare(
        `INSERT INTO workflow_runs (id, issue_number, issue_url, repo, status, source_type, mode, repair_round, created_at, updated_at, metadata)
         VALUES (?, ?, ?, ?, 'new', ?, ?, 0, ?, ?, ?)`
      )
      .run(id, opts.issueNumber, opts.issueUrl, opts.repo, sourceType, mode, now, now, metadata);

    return this.getWorkflowRun(id)!;
  }

  getWorkflowRun(id: string): WorkflowRun | undefined {
    const row = this.db
      .prepare("SELECT * FROM workflow_runs WHERE id = ?")
      .get(id) as WorkflowRunRow | null;
    return row ? rowToWorkflowRun(row) : undefined;
  }

  getWorkflowRunByIssue(
    repo: string,
    issueNumber: number
  ): WorkflowRun | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM workflow_runs WHERE repo = ? AND issue_number = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(repo, issueNumber) as WorkflowRunRow | null;
    return row ? rowToWorkflowRun(row) : undefined;
  }

  updateStatus(
    id: string,
    to: WorkflowStatus,
    reason: string
  ): WorkflowRun {
    const current = this.getWorkflowRun(id);
    if (!current) {
      throw new Error(`Workflow run not found: ${id}`);
    }

    const now = new Date().toISOString();
    const from = current.status;

    // Enforce valid state transitions
    assertTransition(from, to);

    this.db
      .prepare(
        "UPDATE workflow_runs SET status = ?, updated_at = ? WHERE id = ?"
      )
      .run(to, now, id);

    this.db
      .prepare(
        `INSERT INTO status_transitions (workflow_run_id, from_status, to_status, timestamp, reason)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, from, to, now, reason);

    return this.getWorkflowRun(id)!;
  }

  updateWorkflowRun(
    id: string,
    fields: Partial<
      Pick<
        WorkflowRun,
        | "branch"
        | "prNumber"
        | "prUrl"
        | "worktreePath"
        | "currentPhase"
        | "repairRound"
        | "metadata"
        | "runnerId"
        | "agentProfile"
        | "blockedReason"
        | "nextAction"
        | "requestedModel"
        | "actualProvider"
        | "actualModel"
      >
    >
  ): WorkflowRun {
    const current = this.getWorkflowRun(id);
    if (!current) {
      throw new Error(`Workflow run not found: ${id}`);
    }

    const now = new Date().toISOString();
    const sets: string[] = ["updated_at = ?"];
    const values: (string | number | null)[] = [now];

    if (fields.branch !== undefined) {
      sets.push("branch = ?");
      values.push(fields.branch);
    }
    if (fields.prNumber !== undefined) {
      sets.push("pr_number = ?");
      values.push(fields.prNumber);
    }
    if (fields.prUrl !== undefined) {
      sets.push("pr_url = ?");
      values.push(fields.prUrl);
    }
    if (fields.worktreePath !== undefined) {
      sets.push("worktree_path = ?");
      values.push(fields.worktreePath);
    }
    if (fields.currentPhase !== undefined) {
      sets.push("current_phase = ?");
      values.push(fields.currentPhase);
    }
    if (fields.repairRound !== undefined) {
      sets.push("repair_round = ?");
      values.push(fields.repairRound);
    }
    if (fields.metadata !== undefined) {
      sets.push("metadata = ?");
      values.push(JSON.stringify(fields.metadata));
    }
    if (fields.runnerId !== undefined) {
      sets.push("runner_id = ?");
      values.push(fields.runnerId);
    }
    if (fields.agentProfile !== undefined) {
      sets.push("agent_profile = ?");
      values.push(fields.agentProfile);
    }
    if (fields.blockedReason !== undefined) {
      sets.push("blocked_reason = ?");
      values.push(fields.blockedReason);
    }
    if (fields.nextAction !== undefined) {
      sets.push("next_action = ?");
      values.push(fields.nextAction);
    }
    if (fields.requestedModel !== undefined) {
      sets.push("requested_model = ?");
      values.push(fields.requestedModel);
    }
    if (fields.actualProvider !== undefined) {
      sets.push("actual_provider = ?");
      values.push(fields.actualProvider);
    }
    if (fields.actualModel !== undefined) {
      sets.push("actual_model = ?");
      values.push(fields.actualModel);
    }

    values.push(id);
    this.db
      .prepare(`UPDATE workflow_runs SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getWorkflowRun(id)!;
  }

  createAgentRun(opts: {
    workflowRunId: string;
    phase: string;
    inputPath?: string;
    runnerId?: string;
    executorKind?: "executor" | "reviewer" | "repairer";
    profile?: string;
    triggeredBy?: "human" | "policy" | "autopilot";
  }): AgentRun {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO agent_runs (id, workflow_run_id, phase, status, started_at, input_path, runner_id, executor_kind, profile, triggered_by)
         VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        opts.workflowRunId,
        opts.phase,
        now,
        opts.inputPath ?? null,
        opts.runnerId ?? null,
        opts.executorKind ?? null,
        opts.profile ?? null,
        opts.triggeredBy ?? null,
      );

    return this.getAgentRun(id)!;
  }

  getAgentRun(id: string): AgentRun | undefined {
    const row = this.db
      .prepare("SELECT * FROM agent_runs WHERE id = ?")
      .get(id) as AgentRunRow | null;
    return row ? rowToAgentRun(row) : undefined;
  }

  completeAgentRun(
    id: string,
    result: {
      status: "success" | "failed" | "timeout";
      outputPath?: string;
      eventsPath?: string;
      iterations?: number;
      costUsd?: number;
      stderrPath?: string;
      stdoutPath?: string;
      exitReason?: string;
    }
  ): AgentRun {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `UPDATE agent_runs
         SET status = ?, finished_at = ?, output_path = ?, events_path = ?, iterations = ?, cost_usd = ?, stderr_path = ?, stdout_path = ?, exit_reason = ?
         WHERE id = ?`
      )
      .run(
        result.status,
        now,
        result.outputPath ?? null,
        result.eventsPath ?? null,
        result.iterations ?? null,
        result.costUsd ?? null,
        result.stderrPath ?? null,
        result.stdoutPath ?? null,
        result.exitReason ?? null,
        id
      );

    return this.getAgentRun(id)!;
  }

  getTransitions(workflowRunId: string): StatusTransition[] {
    const rows = this.db
      .prepare(
        "SELECT from_status, to_status, timestamp, reason FROM status_transitions WHERE workflow_run_id = ? ORDER BY id"
      )
      .all(workflowRunId) as TransitionRow[];

    return rows.map((row) => ({
      from: row.from_status as WorkflowStatus,
      to: row.to_status as WorkflowStatus,
      timestamp: row.timestamp,
      reason: row.reason,
    }));
  }

  listByStatus(status: WorkflowStatus): WorkflowRun[] {
    const rows = this.db
      .prepare("SELECT * FROM workflow_runs WHERE status = ? ORDER BY created_at")
      .all(status) as WorkflowRunRow[];

    return rows.map(rowToWorkflowRun);
  }

  getAgentRunsByWorkflow(workflowRunId: string): AgentRun[] {
    const rows = this.db
      .prepare("SELECT * FROM agent_runs WHERE workflow_run_id = ? ORDER BY started_at")
      .all(workflowRunId) as AgentRunRow[];
    return rows.map(rowToAgentRun);
  }

  deleteWorkflowRun(id: string): void {
    this.db.prepare("DELETE FROM approval_requests WHERE workflow_run_id = ?").run(id);
    this.db.prepare("DELETE FROM artifacts WHERE workflow_run_id = ?").run(id);
    this.db.prepare("DELETE FROM status_transitions WHERE workflow_run_id = ?").run(id);
    this.db.prepare("DELETE FROM agent_runs WHERE workflow_run_id = ?").run(id);
    this.db.prepare("DELETE FROM workflow_runs WHERE id = ?").run(id);
  }

  // ─── Artifacts ────────────────────────────────────────────

  createArtifact(opts: {
    workflowRunId: string;
    agentRunId?: string;
    type: ArtifactType;
    phase: string;
    summary: string;
    data: Record<string, unknown>;
    filePath?: string;
    verdict?: string;
    blockingCount?: number;
    confidence?: number;
    warningCount?: number;
    riskLevel?: string;
  }): Artifact {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO artifacts (id, workflow_run_id, agent_run_id, type, phase, summary, data, file_path, created_at, verdict, blocking_count, confidence, warning_count, risk_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        opts.workflowRunId,
        opts.agentRunId ?? null,
        opts.type,
        opts.phase,
        opts.summary,
        JSON.stringify(opts.data),
        opts.filePath ?? null,
        now,
        opts.verdict ?? null,
        opts.blockingCount ?? null,
        opts.confidence ?? null,
        opts.warningCount ?? null,
        opts.riskLevel ?? null,
      );

    return this.getArtifact(id)!;
  }

  getArtifact(id: string): Artifact | undefined {
    const row = this.db
      .prepare("SELECT * FROM artifacts WHERE id = ?")
      .get(id) as ArtifactRow | null;
    return row ? rowToArtifact(row) : undefined;
  }

  getArtifactsByWorkflow(workflowRunId: string): Artifact[] {
    const rows = this.db
      .prepare("SELECT * FROM artifacts WHERE workflow_run_id = ? ORDER BY created_at")
      .all(workflowRunId) as ArtifactRow[];
    return rows.map(rowToArtifact);
  }

  getLatestArtifact(
    workflowRunId: string,
    type: ArtifactType,
  ): Artifact | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM artifacts WHERE workflow_run_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(workflowRunId, type) as ArtifactRow | null;
    return row ? rowToArtifact(row) : undefined;
  }

  // ─── Approval Requests ─────────────────────────────────────

  createApprovalRequest(opts: {
    workflowRunId: string;
    phase: string;
    summary: string;
    severity?: "low" | "medium" | "high" | "critical";
    recommendedAction?: string;
    requestedBy?: string;
    reviewerRunId?: string;
  }): ApprovalRequest {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO approval_requests (id, workflow_run_id, phase, summary, created_at, severity, recommended_action, requested_by, reviewer_run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        opts.workflowRunId,
        opts.phase,
        opts.summary,
        now,
        opts.severity ?? null,
        opts.recommendedAction ?? null,
        opts.requestedBy ?? null,
        opts.reviewerRunId ?? null,
      );

    return this.getApprovalRequest(id)!;
  }

  getApprovalRequest(id: string): ApprovalRequest | undefined {
    const row = this.db
      .prepare("SELECT * FROM approval_requests WHERE id = ?")
      .get(id) as ApprovalRequestRow | null;
    return row ? rowToApprovalRequest(row) : undefined;
  }

  getPendingApproval(workflowRunId: string): ApprovalRequest | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM approval_requests WHERE workflow_run_id = ? AND action IS NULL ORDER BY created_at DESC LIMIT 1",
      )
      .get(workflowRunId) as ApprovalRequestRow | null;
    return row ? rowToApprovalRequest(row) : undefined;
  }

  resolveApprovalRequest(
    id: string,
    action: ApprovalAction,
    reviewerComment?: string,
  ): ApprovalRequest {
    const now = new Date().toISOString();
    this.db
      .prepare(
        "UPDATE approval_requests SET action = ?, reviewer_comment = ?, resolved_at = ? WHERE id = ?",
      )
      .run(action, reviewerComment ?? null, now, id);

    return this.getApprovalRequest(id)!;
  }

  getApprovalsByWorkflow(workflowRunId: string): ApprovalRequest[] {
    const rows = this.db
      .prepare("SELECT * FROM approval_requests WHERE workflow_run_id = ? ORDER BY created_at")
      .all(workflowRunId) as ApprovalRequestRow[];
    return rows.map(rowToApprovalRequest);
  }

  listPendingApprovals(): ApprovalRequest[] {
    const rows = this.db
      .prepare("SELECT * FROM approval_requests WHERE action IS NULL ORDER BY created_at")
      .all() as ApprovalRequestRow[];
    return rows.map(rowToApprovalRequest);
  }

  listAll(): WorkflowRun[] {
    const rows = this.db
      .prepare("SELECT * FROM workflow_runs ORDER BY updated_at DESC")
      .all() as WorkflowRunRow[];
    return rows.map(rowToWorkflowRun);
  }

  close(): void {
    this.db.close();
  }
}
