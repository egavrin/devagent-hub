export type WorkflowStatus =
  | "new" | "triaged" | "plan_draft" | "plan_revision" | "plan_accepted"
  | "implementing" | "awaiting_local_verify" | "draft_pr_opened"
  | "auto_review_fix_loop" | "awaiting_human_review" | "ready_to_merge"
  | "done" | "escalated" | "failed";

export interface WorkflowRun {
  id: string;
  issueNumber: number;
  issueUrl: string;
  repo: string;
  status: WorkflowStatus;
  branch: string | null;
  prNumber: number | null;
  prUrl: string | null;
  worktreePath: string | null;
  currentPhase: string | null;
  repairRound: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface AgentRun {
  id: string;
  workflowRunId: string;
  phase: string;
  status: "running" | "success" | "failed" | "timeout";
  startedAt: string;
  finishedAt: string | null;
  inputPath: string | null;
  outputPath: string | null;
  eventsPath: string | null;
  iterations: number | null;
  costUsd: number | null;
}

export interface StatusTransition {
  from: WorkflowStatus;
  to: WorkflowStatus;
  timestamp: string;
  reason: string;
}
