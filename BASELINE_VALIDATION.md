# Baseline Validation

This repo owns the pinned baseline manifest for the four-repo machine path.

## Pinned Baseline

The canonical baseline is stored in [baseline.json](baseline.json).

Validation assumes:

- all four repos are checked out as siblings
- each repo is on `main`
- each repo matches the SHA recorded in the manifest
- protocol version is `0.1`

## Bootstrap

From the `devagent-hub` repo root:

```bash
bun install
bun run bootstrap:local
```

That bootstrap path is the only documented local setup flow for this MVP. It builds the sibling
repos in dependency order and links the local CLIs:

- `devagent`
- `devagent-runner`
- `devagent-hub`

## Local Baseline Checks

Run these from the sibling repos after bootstrap:

```bash
cd ../devagent-sdk && bun run typecheck && bun run test
cd ../devagent-runner && bun run typecheck && bun run test
cd ../devagent && bun run typecheck && bun run test
cd ../devagent-hub && bunx tsc --noEmit && bun run test && bun run build
cd ../devagent-hub && bun run baseline:drift
cd ../devagent-hub && bun run baseline:compat
cd ../devagent-hub && bun run baseline:smoke
```

`baseline:check` is intentionally strict and should be run only when the working trees are expected
to match the pinned manifest exactly.

## What The Baseline Scripts Prove

- `baseline:check`
  - verifies each sibling repo matches the manifest SHA and has a clean working tree
- `baseline:drift`
  - fails if protocol types are declared outside `devagent-sdk`
- `baseline:compat`
  - validates SDK fixtures and Hub-generated SDK requests
- `baseline:smoke`
  - runs the local machine path through `devagent-runner -> devagent execute`
  - covers `triage`, `plan`, `implement`, `verify`, `review`, `repair`
  - includes failure drills for invalid requests, bad verification commands, missing artifact directory, unsupported capability, and cancellation

## Fresh Issue To PR Flow

The standard assisted path is:

```bash
devagent-hub project add
devagent-hub issue sync
devagent-hub run start --issue <number>
devagent-hub status <workflow-id>
devagent-hub run resume <workflow-id>
devagent-hub status <workflow-id>
devagent-hub pr open <workflow-id>
```

Success criteria:

- the workflow pauses after `plan`
- the workflow pauses again before PR handoff
- `status` shows the latest artifact paths and next operator action
- the PR opens from a fresh branch off current `main`

## Review The Plan

If logs are not enough, use the artifact path from `status`.

Example:

```bash
devagent-hub status <workflow-id>
cat <path-printed-for-plan.md>
```

Expected `status` shape:

```text
Workflow: <workflow-id>
Stage: plan
Status: waiting_approval
Approval pending: yes (plan)
Artifacts:
  plan: .devagent-runner/artifacts/<task-id>/plan.md
Next action: Review the plan artifact, then run: devagent-hub run resume <workflow-id>
```

Approve:

```bash
devagent-hub run resume <workflow-id>
```

Reject with human feedback:

```bash
devagent-hub run reject <workflow-id> --note "plan is too broad; keep this PR under 10 files"
```

Expected behavior:

- the note becomes input to the next `plan`
- Hub reruns `plan`
- the workflow pauses again on `plan` for another human review pass

## Review Before PR

When the workflow pauses before PR creation:

```bash
devagent-hub status <workflow-id>
cat <path-printed-for-verification-report.md>
cat <path-printed-for-review-report.md>
```

Approve final handoff:

```bash
devagent-hub pr open <workflow-id>
```

Reject and request more fixes:

```bash
devagent-hub run reject <workflow-id> --note "address security concerns before PR handoff"
```

Expected behavior:

- the note becomes input to the next `repair`
- Hub reruns `repair -> verify -> review`
- the workflow pauses again before PR handoff

## Post-PR Repair Flow

Once the PR is open and has review comments or failing checks:

```bash
devagent-hub pr repair <workflow-id>
devagent-hub status <workflow-id>
```

Expected behavior:

- GitHub review comments and CI logs are fetched
- repair context includes changed-file hints when available
- Hub reruns `repair -> verify -> review`
- the existing PR branch is updated

## Oversize Change Safety

Hub enforces review size controls from `WORKFLOW.md`:

- if changed files exceed `review.max_changed_files`, Hub pauses for manual approval with an explicit reason
- if changed files exceed `review.run_max_changed_files`, Hub stops automatic continuation and marks the workflow failed
- if patch size exceeds `review.max_patch_bytes`, Hub pauses for manual approval with an explicit reason
- if patch size exceeds `review.run_max_patch_bytes`, Hub stops automatic continuation and marks the workflow failed

Use `devagent-hub status <workflow-id>` to see the escalation reason and the next safe action.

## Stale-State Rules

Hub stores a baseline snapshot on workflow start:

- target branch
- target base SHA
- pinned system baseline `{ sdkSha, runnerSha, devagentSha, hubSha, protocolVersion }`

On `run resume`, `pr open`, and `pr repair`, Hub compares the stored snapshot with current repo
state.

If the baseline no longer matches, Hub fails explicitly with:

- `STALE_BASELINE`
- `STALE_BRANCH_REF`
- `HISTORICAL_RUN_REQUIRES_MANUAL_INTERVENTION`

## Live Validation Ladder

Run fresh baseline validation in this order:

1. local baseline checks
2. fresh `devagent` issue to approval to PR from current `main`
3. fresh `devagent-hub` issue to approval to PR from current `main`
4. repair loop on a fresh PR using `devagent-hub pr repair`
5. stale-history resilience checks against pre-rewrite runs, branches, or PR heads

Avoid resuming pre-rewrite `devagent` branches as a baseline scenario. Those are migration-safety
inputs only.
