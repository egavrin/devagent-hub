const TRANSITIONS = {
    new: ["triaged", "failed", "escalated", "budget_exceeded"],
    triaged: ["plan_draft", "failed", "escalated", "budget_exceeded"],
    plan_draft: ["plan_revision", "plan_accepted", "failed", "escalated", "budget_exceeded"],
    plan_revision: ["plan_draft", "plan_accepted", "failed", "escalated", "budget_exceeded"],
    plan_accepted: ["implementing", "failed", "escalated", "budget_exceeded"],
    implementing: ["awaiting_local_verify", "failed", "escalated", "budget_exceeded"],
    awaiting_local_verify: [
        "draft_pr_opened",
        "implementing",
        "failed",
        "escalated",
        "budget_exceeded",
    ],
    draft_pr_opened: [
        "auto_review_fix_loop",
        "awaiting_human_review",
        "failed",
        "escalated",
        "budget_exceeded",
    ],
    auto_review_fix_loop: [
        "draft_pr_opened",
        "awaiting_human_review",
        "failed",
        "escalated",
        "budget_exceeded",
    ],
    awaiting_human_review: [
        "auto_review_fix_loop",
        "ready_to_merge",
        "failed",
        "escalated",
        "budget_exceeded",
    ],
    ready_to_merge: ["done", "failed", "escalated", "budget_exceeded"],
    done: [],
    escalated: [],
    failed: [
        "new", "triaged", "plan_accepted", "implementing",
        "draft_pr_opened", "auto_review_fix_loop",
    ], // allow retry from any phase
    budget_exceeded: ["needs_human_budget_override", "failed", "escalated"],
    needs_human_budget_override: [
        "new", "triaged", "plan_accepted", "implementing",
        "draft_pr_opened", "auto_review_fix_loop",
        "budget_exceeded", "failed", "escalated",
    ],
};
const PHASE_MAP = {
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
    budget_exceeded: null,
    needs_human_budget_override: null,
};
/**
 * Check whether a transition from one status to another is valid.
 */
export function canTransition(from, to) {
    const allowed = TRANSITIONS[from];
    return allowed.includes(to);
}
/**
 * Return the list of valid target statuses from a given status.
 */
export function getValidTransitions(from) {
    return [...TRANSITIONS[from]];
}
/**
 * Assert that a transition is valid; throws if not.
 */
export function assertTransition(from, to) {
    if (!canTransition(from, to)) {
        throw new Error(`Invalid workflow transition: ${from} -> ${to}. Valid targets: ${TRANSITIONS[from].join(", ") || "(none)"}`);
    }
}
/**
 * Map a workflow status to the name of its next phase, or null for terminal states.
 */
export function getNextPhase(status) {
    return PHASE_MAP[status];
}
