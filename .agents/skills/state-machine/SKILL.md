---
name: state-machine
description: Review and modify the canonical workflow/task/approval state machine without breaking staged orchestration.
---

# State Machine

The canonical workflow state lives in `src/workflows/service.ts`, `src/canonical/types.ts`, and
`src/persistence/canonical-store.ts`.

## Current workflow stages

`triage -> plan -> implement -> verify -> review -> repair -> done`

Workflow status is tracked separately:

`queued | running | waiting_approval | failed | completed | cancelled`

## Rules

- Keep workflow state changes inside `WorkflowService`.
- Persist all workflow/task/attempt/approval changes through `CanonicalStore`.
- Do not mutate persisted state ad hoc in the CLI or TUI.
- Preserve the hard checkpoints after `plan` and before PR creation.
- If you change stage progression, update the workflow tests in `src/__tests__/workflow-service.test.ts`.
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
