import type { WorkflowRun, WorkflowStatus, SourceType, WorkflowMode, AgentRun, StatusTransition, Artifact, ArtifactType, ApprovalRequest, ApprovalAction } from "./types.js";
export declare class StateStore {
    private db;
    constructor(dbPath: string);
    private migrate;
    createWorkflowRun(opts: {
        issueNumber: number;
        issueUrl: string;
        repo: string;
        sourceType?: SourceType;
        mode?: WorkflowMode;
        sourceRef?: string | null;
        metadata?: Record<string, unknown>;
    }): WorkflowRun;
    getWorkflowRun(id: string): WorkflowRun | undefined;
    getWorkflowRunByIssue(repo: string, issueNumber: number): WorkflowRun | undefined;
    updateStatus(id: string, to: WorkflowStatus, reason: string, artifactId?: string): WorkflowRun;
    updateWorkflowRun(id: string, fields: Partial<Pick<WorkflowRun, "branch" | "prNumber" | "prUrl" | "worktreePath" | "currentPhase" | "repairRound" | "metadata" | "runnerId" | "agentProfile" | "blockedReason" | "nextAction" | "sourceRef" | "requestedModel" | "actualProvider" | "actualModel">>): WorkflowRun;
    createAgentRun(opts: {
        workflowRunId: string;
        phase: string;
        inputPath?: string;
        runnerId?: string;
        executorKind?: "executor" | "reviewer" | "repairer";
        profile?: string;
        triggeredBy?: "human" | "policy" | "autopilot";
    }): AgentRun;
    getAgentRun(id: string): AgentRun | undefined;
    completeAgentRun(id: string, result: {
        status: "success" | "failed" | "timeout";
        outputPath?: string;
        eventsPath?: string;
        iterations?: number;
        costUsd?: number;
        stderrPath?: string;
        stdoutPath?: string;
        exitReason?: string;
    }): AgentRun;
    getTransitions(workflowRunId: string): StatusTransition[];
    listByStatus(status: WorkflowStatus): WorkflowRun[];
    getAgentRunsByWorkflow(workflowRunId: string): AgentRun[];
    getRecentAgentRuns(limit?: number): AgentRun[];
    deleteWorkflowRun(id: string): void;
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
    }): Artifact;
    getArtifact(id: string): Artifact | undefined;
    getArtifactsByWorkflow(workflowRunId: string): Artifact[];
    getLatestArtifact(workflowRunId: string, type: ArtifactType): Artifact | undefined;
    createApprovalRequest(opts: {
        workflowRunId: string;
        phase: string;
        summary: string;
        severity?: "low" | "medium" | "high" | "critical";
        recommendedAction?: string;
        requestedBy?: string;
        reviewerRunId?: string;
    }): ApprovalRequest;
    getApprovalRequest(id: string): ApprovalRequest | undefined;
    getPendingApproval(workflowRunId: string): ApprovalRequest | undefined;
    resolveApprovalRequest(id: string, action: ApprovalAction, reviewerComment?: string): ApprovalRequest;
    getApprovalsByWorkflow(workflowRunId: string): ApprovalRequest[];
    listPendingApprovals(): ApprovalRequest[];
    listAll(): WorkflowRun[];
    close(): void;
}
