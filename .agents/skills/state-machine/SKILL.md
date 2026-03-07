# State Machine

The workflow orchestrator (`src/workflow/orchestrator.ts`) manages run lifecycle through a strict state machine enforced by `assertTransition()` in `src/state/store.ts`.

## Valid states

`triaging → planning → plan_review → plan_revision → implementing → verifying → reviewing → repairing → done | failed | escalated`

## Rules

- Every status change must go through `store.updateStatus(runId, newStatus)` which calls `assertTransition()`.
- Never set status directly on the DB — always use the store method.
- The `plan_revision` status enables rework loops: `plan_review → plan_revision → planning → plan_review`.
- Terminal states (`done`, `failed`, `escalated`) cannot transition further.
- `escalated` is used by autopilot when risk thresholds are exceeded.

## Artifacts

Every phase must store its output as an artifact via `store.createArtifact()`:

| Phase | Artifact type | Key fields |
|-------|--------------|------------|
| triage | `triage_report` | summary, complexity |
| plan | `plan_draft` | summary, steps |
| approve | `accepted_plan` | copy of plan_draft |
| implement | (commit) | changedFiles |
| verify | `verification_report` | passed, results |
| review | `review_report` | verdict, blockingCount |
| repair | `repair_report` | fixedFindings |
| gate | `gate_verdict` | verdict, confidence |

## Approval requests

- `plan_review` creates an `ApprovalRequest` with action `approve_plan`.
- `approvePlan()` resolves it and copies `plan_draft → accepted_plan`.
- `reworkPlan()` resolves as `rework` and re-enters `plan_revision`.

## Error handling

- Non-critical GitHub calls (comments, labels) use `safeGitHub()` — log to stderr, don't throw.
- Critical calls (fetchIssue, pushBranch, createPR) throw — workflow can't proceed without them.
- On implement failure, call `cleanupWorktree()` to prevent orphaned worktrees.
