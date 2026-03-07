import type { WorkflowStatus } from "../state/types.js";

const TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  new: ["triaged", "failed", "escalated"],
  triaged: ["plan_draft", "failed", "escalated"],
  plan_draft: ["plan_revision", "plan_accepted", "failed", "escalated"],
  plan_revision: ["plan_draft", "plan_accepted", "failed", "escalated"],
  plan_accepted: ["implementing", "failed", "escalated"],
  implementing: ["awaiting_local_verify", "failed", "escalated"],
  awaiting_local_verify: [
    "draft_pr_opened",
    "implementing",
    "failed",
    "escalated",
  ],
  draft_pr_opened: [
    "auto_review_fix_loop",
    "awaiting_human_review",
    "failed",
    "escalated",
  ],
  auto_review_fix_loop: [
    "draft_pr_opened",
    "awaiting_human_review",
    "failed",
    "escalated",
  ],
  awaiting_human_review: [
    "auto_review_fix_loop",
    "ready_to_merge",
    "failed",
    "escalated",
  ],
  ready_to_merge: ["done", "failed", "escalated"],
  done: [],
  escalated: [],
  failed: [
    "new", "triaged", "plan_accepted", "implementing",
    "draft_pr_opened", "auto_review_fix_loop",
  ], // allow retry from any phase
};

const PHASE_MAP: Record<WorkflowStatus, string | null> = {
  new: "triage",
  triaged: "plan",
  plan_draft: "plan_review",
  plan_revision: "plan_review",
  plan_accepted: "implement",
  implementing: "local_verify",
  awaiting_local_verify: "open_pr",
  draft_pr_opened: "auto_review",
  auto_review_fix_loop: "auto_review",
  awaiting_human_review: "human_review",
  ready_to_merge: "merge",
  done: null,
  escalated: null,
  failed: null,
};

/**
 * Check whether a transition from one status to another is valid.
 */
export function canTransition(
  from: WorkflowStatus,
  to: WorkflowStatus,
): boolean {
  const allowed = TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Return the list of valid target statuses from a given status.
 */
export function getValidTransitions(from: WorkflowStatus): WorkflowStatus[] {
  return [...TRANSITIONS[from]];
}

/**
 * Assert that a transition is valid; throws if not.
 */
export function assertTransition(
  from: WorkflowStatus,
  to: WorkflowStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid workflow transition: ${from} -> ${to}. Valid targets: ${TRANSITIONS[from].join(", ") || "(none)"}`,
    );
  }
}

/**
 * Map a workflow status to the name of its next phase, or null for terminal states.
 */
export function getNextPhase(status: WorkflowStatus): string | null {
  return PHASE_MAP[status];
}
