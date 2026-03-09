/**
 * View models decouple UI components from raw state types.
 * Each builder transforms domain data into display-ready values.
 */
import type { WorkflowRun, WorkflowMode, Artifact, StatusTransition, AgentRun, ApprovalRequest } from "../state/types.js";
import type { OperatorStatus } from "./status-map.js";
export interface RunCardViewModel {
    id: string;
    issueNumber: number;
    title: string;
    age: string;
    phase: string;
    humanStatus: string;
    statusColor: string;
    operatorStatus: OperatorStatus;
    repairRound: number;
    hasPr: boolean;
    blockedReason: string | null;
    suggestedAction: {
        key: string;
        label: string;
    } | null;
}
export declare function toRunCardViewModel(run: WorkflowRun): RunCardViewModel;
export interface BoardSummaryViewModel {
    mode: WorkflowMode | null;
    runningCount: number;
    needsActionCount: number;
    blockedCount: number;
    failedCount: number;
    doneCount: number;
    queuedCount: number;
    waitingCount: number;
    totalCount: number;
}
export declare function toBoardSummaryViewModel(runs: WorkflowRun[]): BoardSummaryViewModel;
export interface GateViewModel {
    id: string;
    phase: string;
    action: string;
    color: string;
    icon: string;
}
export interface BlockedViewModel {
    reason: string;
    suggestion: string;
}
export interface RunDetailViewModel {
    issueNumber: number;
    title: string;
    humanStatus: string;
    statusColor: string;
    operatorStatus: OperatorStatus;
    phase: string;
    repairRound: number;
    age: string;
    modeLabel: string;
    profile: string | null;
    model: string | null;
    runner: string | null;
    branch: string | null;
    prUrl: string | null;
    isActive: boolean;
    blocked: BlockedViewModel | null;
    suggestedAction: {
        key: string;
        label: string;
    } | null;
    pendingApprovalCount: number;
    pendingApprovalSummaries: string[];
    gates: GateViewModel[];
    latestArtifact: {
        type: string;
        summary: string | null;
    } | null;
    recentTransitions: {
        time: string;
        from: string;
        to: string;
        reason: string | null;
    }[];
    agentRunCount: number;
    totalCost: number;
}
export declare function toRunDetailViewModel(run: WorkflowRun, artifacts: Artifact[], transitions: StatusTransition[], agentRuns: AgentRun[], approvals: ApprovalRequest[], isActive: boolean): RunDetailViewModel;
