const STATUS_MAP = {
    new: "Queued",
    triaged: "Queued",
    plan_draft: "Needs Action",
    plan_revision: "Needs Action",
    plan_accepted: "Waiting",
    implementing: "Running",
    awaiting_local_verify: "Needs Action",
    draft_pr_opened: "Waiting",
    auto_review_fix_loop: "Running",
    awaiting_human_review: "Needs Action",
    ready_to_merge: "Needs Action",
    done: "Done",
    escalated: "Blocked",
    failed: "Blocked",
    budget_exceeded: "Blocked",
    needs_human_budget_override: "Needs Action",
};
export function toOperatorStatus(status) {
    return STATUS_MAP[status] ?? "Waiting";
}
/** Color for each operator bucket */
export function operatorStatusColor(os) {
    switch (os) {
        case "Needs Action": return "yellow";
        case "Running": return "blue";
        case "Waiting": return "white";
        case "Done": return "green";
        case "Blocked": return "red";
        case "Queued": return "gray";
    }
}
/**
 * Short human-readable label for a workflow status.
 * Used inside cards to show secondary detail.
 */
export function humanStatus(status) {
    const labels = {
        new: "new",
        triaged: "triaged",
        plan_draft: "plan ready",
        plan_revision: "plan revision",
        plan_accepted: "plan ok",
        implementing: "implementing",
        awaiting_local_verify: "needs verify",
        draft_pr_opened: "PR opened",
        auto_review_fix_loop: "auto-fixing",
        awaiting_human_review: "needs review",
        ready_to_merge: "ready to merge",
        done: "done",
        escalated: "escalated",
        failed: "failed",
        budget_exceeded: "over budget",
        needs_human_budget_override: "budget approval",
    };
    return labels[status] ?? status;
}
/**
 * Suggested next action for an operator, given a run's status.
 */
export function suggestedAction(status) {
    switch (status) {
        case "plan_draft":
        case "plan_revision":
            return { key: "A", label: "Approve plan" };
        case "awaiting_local_verify":
            return { key: "C", label: "Continue" };
        case "awaiting_human_review":
            return { key: "A", label: "Approve review" };
        case "ready_to_merge":
            return { key: "A", label: "Mark done" };
        case "failed":
            return { key: "R", label: "Retry" };
        case "escalated":
            return { key: "T", label: "Take over" };
        case "needs_human_budget_override":
            return { key: "A", label: "Override budget" };
        case "new":
        case "triaged":
        case "plan_accepted":
            return { key: "C", label: "Continue" };
        default:
            return null;
    }
}
