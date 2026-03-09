import { Database } from "bun:sqlite";
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
  source_ref TEXT,
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
  artifact_id TEXT,
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
function rowToArtifact(row) {
    return {
        id: row.id,
        workflowRunId: row.workflow_run_id,
        agentRunId: row.agent_run_id,
        type: row.type,
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
function rowToApprovalRequest(row) {
    return {
        id: row.id,
        workflowRunId: row.workflow_run_id,
        phase: row.phase,
        action: row.action,
        summary: row.summary,
        reviewerComment: row.reviewer_comment,
        resolvedAt: row.resolved_at,
        createdAt: row.created_at,
        severity: row.severity ?? null,
        recommendedAction: row.recommended_action ?? null,
        requestedBy: row.requested_by ?? null,
        reviewerRunId: row.reviewer_run_id ?? null,
    };
}
function rowToWorkflowRun(row) {
    return {
        id: row.id,
        issueNumber: row.issue_number,
        issueUrl: row.issue_url,
        repo: row.repo,
        status: row.status,
        sourceType: (row.source_type ?? "issue"),
        mode: (row.mode ?? "assisted"),
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
        sourceRef: row.source_ref ?? null,
        requestedModel: row.requested_model ?? null,
        actualProvider: row.actual_provider ?? null,
        actualModel: row.actual_model ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        metadata: JSON.parse(row.metadata),
    };
}
function rowToAgentRun(row) {
    return {
        id: row.id,
        workflowRunId: row.workflow_run_id,
        phase: row.phase,
        status: row.status,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        inputPath: row.input_path,
        outputPath: row.output_path,
        eventsPath: row.events_path,
        iterations: row.iterations,
        costUsd: row.cost_usd,
        runnerId: row.runner_id ?? null,
        executorKind: row.executor_kind ?? null,
        profile: row.profile ?? null,
        triggeredBy: row.triggered_by ?? null,
        stderrPath: row.stderr_path ?? null,
        stdoutPath: row.stdout_path ?? null,
        exitReason: row.exit_reason ?? null,
    };
}
export class StateStore {
    db;
    constructor(dbPath) {
        this.db = new Database(dbPath);
        this.db.exec("PRAGMA journal_mode = WAL");
        this.db.exec("PRAGMA foreign_keys = ON");
        this.db.exec(MIGRATIONS);
        this.migrate();
    }
    migrate() {
        // Add source_type and mode columns if missing (v2 migration)
        const cols = this.db.prepare("PRAGMA table_info(workflow_runs)").all();
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
        if (!colNames.has("source_ref")) {
            this.db.exec("ALTER TABLE workflow_runs ADD COLUMN source_ref TEXT");
        }
        // Add new columns to agent_runs if missing
        const arCols = this.db.prepare("PRAGMA table_info(agent_runs)").all();
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
        const artCols = this.db.prepare("PRAGMA table_info(artifacts)").all();
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
        const apCols = this.db.prepare("PRAGMA table_info(approval_requests)").all();
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
        // Add artifact_id column to status_transitions if missing
        const stCols = this.db.prepare("PRAGMA table_info(status_transitions)").all();
        const stColNames = new Set(stCols.map((c) => c.name));
        if (!stColNames.has("artifact_id")) {
            this.db.exec("ALTER TABLE status_transitions ADD COLUMN artifact_id TEXT");
        }
    }
    createWorkflowRun(opts) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const metadata = JSON.stringify(opts.metadata ?? {});
        const sourceType = opts.sourceType ?? "issue";
        const mode = opts.mode ?? "assisted";
        const sourceRef = opts.sourceRef ?? null;
        this.db
            .prepare(`INSERT INTO workflow_runs (id, issue_number, issue_url, repo, status, source_type, mode, source_ref, repair_round, created_at, updated_at, metadata)
         VALUES (?, ?, ?, ?, 'new', ?, ?, ?, 0, ?, ?, ?)`)
            .run(id, opts.issueNumber, opts.issueUrl, opts.repo, sourceType, mode, sourceRef, now, now, metadata);
        return this.getWorkflowRun(id);
    }
    getWorkflowRun(id) {
        const row = this.db
            .prepare("SELECT * FROM workflow_runs WHERE id = ?")
            .get(id);
        return row ? rowToWorkflowRun(row) : undefined;
    }
    getWorkflowRunByIssue(repo, issueNumber) {
        const row = this.db
            .prepare("SELECT * FROM workflow_runs WHERE repo = ? AND issue_number = ? ORDER BY created_at DESC LIMIT 1")
            .get(repo, issueNumber);
        return row ? rowToWorkflowRun(row) : undefined;
    }
    updateStatus(id, to, reason, artifactId) {
        const current = this.getWorkflowRun(id);
        if (!current) {
            throw new Error(`Workflow run not found: ${id}`);
        }
        const now = new Date().toISOString();
        const from = current.status;
        // Enforce valid state transitions
        assertTransition(from, to);
        this.db
            .prepare("UPDATE workflow_runs SET status = ?, updated_at = ? WHERE id = ?")
            .run(to, now, id);
        this.db
            .prepare(`INSERT INTO status_transitions (workflow_run_id, from_status, to_status, timestamp, reason, artifact_id)
         VALUES (?, ?, ?, ?, ?, ?)`)
            .run(id, from, to, now, reason, artifactId ?? null);
        return this.getWorkflowRun(id);
    }
    updateWorkflowRun(id, fields) {
        const current = this.getWorkflowRun(id);
        if (!current) {
            throw new Error(`Workflow run not found: ${id}`);
        }
        const now = new Date().toISOString();
        const sets = ["updated_at = ?"];
        const values = [now];
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
        if (fields.sourceRef !== undefined) {
            sets.push("source_ref = ?");
            values.push(fields.sourceRef);
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
        return this.getWorkflowRun(id);
    }
    createAgentRun(opts) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        this.db
            .prepare(`INSERT INTO agent_runs (id, workflow_run_id, phase, status, started_at, input_path, runner_id, executor_kind, profile, triggered_by)
         VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?)`)
            .run(id, opts.workflowRunId, opts.phase, now, opts.inputPath ?? null, opts.runnerId ?? null, opts.executorKind ?? null, opts.profile ?? null, opts.triggeredBy ?? null);
        return this.getAgentRun(id);
    }
    getAgentRun(id) {
        const row = this.db
            .prepare("SELECT * FROM agent_runs WHERE id = ?")
            .get(id);
        return row ? rowToAgentRun(row) : undefined;
    }
    completeAgentRun(id, result) {
        const now = new Date().toISOString();
        this.db
            .prepare(`UPDATE agent_runs
         SET status = ?, finished_at = ?, output_path = ?, events_path = ?, iterations = ?, cost_usd = ?, stderr_path = ?, stdout_path = ?, exit_reason = ?
         WHERE id = ?`)
            .run(result.status, now, result.outputPath ?? null, result.eventsPath ?? null, result.iterations ?? null, result.costUsd ?? null, result.stderrPath ?? null, result.stdoutPath ?? null, result.exitReason ?? null, id);
        return this.getAgentRun(id);
    }
    getTransitions(workflowRunId) {
        const rows = this.db
            .prepare("SELECT from_status, to_status, timestamp, reason, artifact_id FROM status_transitions WHERE workflow_run_id = ? ORDER BY id")
            .all(workflowRunId);
        return rows.map((row) => ({
            from: row.from_status,
            to: row.to_status,
            timestamp: row.timestamp,
            reason: row.reason,
            artifactId: row.artifact_id ?? null,
        }));
    }
    listByStatus(status) {
        const rows = this.db
            .prepare("SELECT * FROM workflow_runs WHERE status = ? ORDER BY created_at")
            .all(status);
        return rows.map(rowToWorkflowRun);
    }
    getAgentRunsByWorkflow(workflowRunId) {
        const rows = this.db
            .prepare("SELECT * FROM agent_runs WHERE workflow_run_id = ? ORDER BY started_at")
            .all(workflowRunId);
        return rows.map(rowToAgentRun);
    }
    getRecentAgentRuns(limit = 50) {
        const rows = this.db
            .prepare("SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT ?")
            .all(limit);
        return rows.map(rowToAgentRun);
    }
    deleteWorkflowRun(id) {
        this.db.prepare("DELETE FROM approval_requests WHERE workflow_run_id = ?").run(id);
        this.db.prepare("DELETE FROM artifacts WHERE workflow_run_id = ?").run(id);
        this.db.prepare("DELETE FROM status_transitions WHERE workflow_run_id = ?").run(id);
        this.db.prepare("DELETE FROM agent_runs WHERE workflow_run_id = ?").run(id);
        this.db.prepare("DELETE FROM workflow_runs WHERE id = ?").run(id);
    }
    // ─── Artifacts ────────────────────────────────────────────
    createArtifact(opts) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        this.db
            .prepare(`INSERT INTO artifacts (id, workflow_run_id, agent_run_id, type, phase, summary, data, file_path, created_at, verdict, blocking_count, confidence, warning_count, risk_level)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, opts.workflowRunId, opts.agentRunId ?? null, opts.type, opts.phase, opts.summary, JSON.stringify(opts.data), opts.filePath ?? null, now, opts.verdict ?? null, opts.blockingCount ?? null, opts.confidence ?? null, opts.warningCount ?? null, opts.riskLevel ?? null);
        return this.getArtifact(id);
    }
    getArtifact(id) {
        const row = this.db
            .prepare("SELECT * FROM artifacts WHERE id = ?")
            .get(id);
        return row ? rowToArtifact(row) : undefined;
    }
    getArtifactsByWorkflow(workflowRunId) {
        const rows = this.db
            .prepare("SELECT * FROM artifacts WHERE workflow_run_id = ? ORDER BY created_at")
            .all(workflowRunId);
        return rows.map(rowToArtifact);
    }
    getLatestArtifact(workflowRunId, type) {
        const row = this.db
            .prepare("SELECT * FROM artifacts WHERE workflow_run_id = ? AND type = ? ORDER BY created_at DESC LIMIT 1")
            .get(workflowRunId, type);
        return row ? rowToArtifact(row) : undefined;
    }
    // ─── Approval Requests ─────────────────────────────────────
    createApprovalRequest(opts) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        this.db
            .prepare(`INSERT INTO approval_requests (id, workflow_run_id, phase, summary, created_at, severity, recommended_action, requested_by, reviewer_run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(id, opts.workflowRunId, opts.phase, opts.summary, now, opts.severity ?? null, opts.recommendedAction ?? null, opts.requestedBy ?? null, opts.reviewerRunId ?? null);
        return this.getApprovalRequest(id);
    }
    getApprovalRequest(id) {
        const row = this.db
            .prepare("SELECT * FROM approval_requests WHERE id = ?")
            .get(id);
        return row ? rowToApprovalRequest(row) : undefined;
    }
    getPendingApproval(workflowRunId) {
        const row = this.db
            .prepare("SELECT * FROM approval_requests WHERE workflow_run_id = ? AND action IS NULL ORDER BY created_at DESC LIMIT 1")
            .get(workflowRunId);
        return row ? rowToApprovalRequest(row) : undefined;
    }
    resolveApprovalRequest(id, action, reviewerComment) {
        const now = new Date().toISOString();
        this.db
            .prepare("UPDATE approval_requests SET action = ?, reviewer_comment = ?, resolved_at = ? WHERE id = ?")
            .run(action, reviewerComment ?? null, now, id);
        return this.getApprovalRequest(id);
    }
    getApprovalsByWorkflow(workflowRunId) {
        const rows = this.db
            .prepare("SELECT * FROM approval_requests WHERE workflow_run_id = ? ORDER BY created_at")
            .all(workflowRunId);
        return rows.map(rowToApprovalRequest);
    }
    listPendingApprovals() {
        const rows = this.db
            .prepare("SELECT * FROM approval_requests WHERE action IS NULL ORDER BY created_at")
            .all();
        return rows.map(rowToApprovalRequest);
    }
    listAll() {
        const rows = this.db
            .prepare("SELECT * FROM workflow_runs ORDER BY updated_at DESC")
            .all();
        return rows.map(rowToWorkflowRun);
    }
    close() {
        this.db.close();
    }
}
