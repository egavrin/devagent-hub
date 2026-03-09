import type { WorkflowStatus } from "../state/types.js";
/**
 * Check whether a transition from one status to another is valid.
 */
export declare function canTransition(from: WorkflowStatus, to: WorkflowStatus): boolean;
/**
 * Return the list of valid target statuses from a given status.
 */
export declare function getValidTransitions(from: WorkflowStatus): WorkflowStatus[];
/**
 * Assert that a transition is valid; throws if not.
 */
export declare function assertTransition(from: WorkflowStatus, to: WorkflowStatus): void;
/**
 * Map a workflow status to the name of its next phase, or null for terminal states.
 */
export declare function getNextPhase(status: WorkflowStatus): string | null;
