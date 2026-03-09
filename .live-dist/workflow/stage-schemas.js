/**
 * Stage input/output schemas — mirrored from @devagent/core/workflow-contract.
 * These types define the typed I/O for each workflow phase.
 */
// ─── Phase Names ─────────────────────────────────────────────
export const WORKFLOW_PHASES = [
    "triage", "plan", "implement", "verify", "review", "repair",
];
