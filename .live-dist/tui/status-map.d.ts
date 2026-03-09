import type { WorkflowStatus } from "../state/types.js";
/**
 * Human-readable operator status buckets.
 * Internal workflow statuses map to 6 operator-visible states.
 */
export type OperatorStatus = "Needs Action" | "Running" | "Waiting" | "Done" | "Blocked" | "Queued";
export declare function toOperatorStatus(status: WorkflowStatus): OperatorStatus;
/** Color for each operator bucket */
export declare function operatorStatusColor(os: OperatorStatus): string;
/**
 * Short human-readable label for a workflow status.
 * Used inside cards to show secondary detail.
 */
export declare function humanStatus(status: WorkflowStatus): string;
/**
 * Suggested next action for an operator, given a run's status.
 */
export declare function suggestedAction(status: WorkflowStatus): {
    key: string;
    label: string;
} | null;
