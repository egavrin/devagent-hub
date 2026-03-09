import type { ApprovalRequest, WorkflowRun } from "../../state/types.js";
interface ApprovalQueueItem {
    approval: ApprovalRequest;
    run: WorkflowRun | undefined;
}
export type InboxItemKind = "approval" | "plan_revision" | "awaiting_review" | "ready_to_merge" | "blocked" | "escalated";
export interface InboxItem {
    kind: InboxItemKind;
    run: WorkflowRun | undefined;
    approval?: ApprovalRequest;
}
export declare function resolveInboxItem(items: ApprovalQueueItem[], planRevisionRuns: WorkflowRun[], awaitingReviewRuns: WorkflowRun[], readyToMergeRuns: WorkflowRun[], escalatedRuns: WorkflowRun[], failedRuns: WorkflowRun[], index: number): InboxItem | null;
interface ApprovalQueueViewProps {
    items: ApprovalQueueItem[];
    planRevisionRuns: WorkflowRun[];
    escalatedRuns: WorkflowRun[];
    failedRuns: WorkflowRun[];
    awaitingReviewRuns: WorkflowRun[];
    readyToMergeRuns: WorkflowRun[];
    selectedIndex: number;
    height: number;
}
export declare function ApprovalQueueView({ items, planRevisionRuns, escalatedRuns, failedRuns, awaitingReviewRuns, readyToMergeRuns, selectedIndex, height }: ApprovalQueueViewProps): import("react/jsx-runtime").JSX.Element;
export type { ApprovalQueueItem };
