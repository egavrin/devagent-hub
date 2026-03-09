export type WorkflowStatus = "new" | "triaged" | "plan_draft" | "plan_revision" | "plan_accepted" | "implementing" | "awaiting_local_verify" | "draft_pr_opened" | "auto_review_fix_loop" | "awaiting_human_review" | "ready_to_merge" | "done" | "escalated" | "failed" | "budget_exceeded" | "needs_human_budget_override";
export type SourceType = "issue" | "pr" | "project-brief";
export type WorkflowMode = "assisted" | "watch" | "autopilot";
export interface WorkflowRun {
    id: string;
    issueNumber: number;
    issueUrl: string;
    repo: string;
    status: WorkflowStatus;
    sourceType: SourceType;
    mode: WorkflowMode;
    runnerId: string | null;
    agentProfile: string | null;
    blockedReason: string | null;
    nextAction: string | null;
    branch: string | null;
    prNumber: number | null;
    prUrl: string | null;
    worktreePath: string | null;
    currentPhase: string | null;
    repairRound: number;
    sourceRef: string | null;
    requestedModel: string | null;
    actualProvider: string | null;
    actualModel: string | null;
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
    runnerId: string | null;
    executorKind: "executor" | "reviewer" | "repairer" | null;
    profile: string | null;
    triggeredBy: "human" | "policy" | "autopilot" | null;
    stderrPath: string | null;
    stdoutPath: string | null;
    exitReason: string | null;
}
export interface StatusTransition {
    from: WorkflowStatus;
    to: WorkflowStatus;
    timestamp: string;
    reason: string;
    artifactId: string | null;
}
export type ArtifactType = "triage_report" | "plan_draft" | "accepted_plan" | "implementation_report" | "verification_report" | "review_report" | "repair_report" | "gate_verdict" | "diff_summary" | "stderr" | "bootstrap_report" | "triage_review" | "plan_review" | "implementation_review" | "verification_review" | "pr_review" | "repair_review";
export interface Artifact {
    id: string;
    workflowRunId: string;
    agentRunId: string | null;
    type: ArtifactType;
    phase: string;
    summary: string;
    data: Record<string, unknown>;
    filePath: string | null;
    createdAt: string;
    verdict: string | null;
    blockingCount: number | null;
    confidence: number | null;
    warningCount: number | null;
    riskLevel: string | null;
}
export type ApprovalAction = "approve" | "rework";
export interface ApprovalRequest {
    id: string;
    workflowRunId: string;
    phase: string;
    action: ApprovalAction | null;
    summary: string;
    reviewerComment: string | null;
    resolvedAt: string | null;
    createdAt: string;
    severity: "low" | "medium" | "high" | "critical" | null;
    recommendedAction: string | null;
    requestedBy: string | null;
    reviewerRunId: string | null;
}
