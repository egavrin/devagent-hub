# DevAgent Hub

Canonical workflow orchestrator for the DevAgent stack.

Hub owns issue import, workflow state, task generation, approvals, persistence, operator CLI/TUI
surfaces, and PR handoff. It does not launch executors directly. Hub resolves an `ExecutorSpec`,
submits an SDK request to `devagent-runner`, ingests normalized events/results/artifacts, and
drives the staged workflow around them.

## Validated Path

The production-grade MVP path is:

```text
devagent-hub -> devagent-runner -> devagent execute --request ... --artifact-dir ...
```

Current live-validated executor settings:

- executor: `devagent`
- provider: `chatgpt`
- model: `gpt-5.4`

Other runner adapters (`codex`, `claude`, `opencode`) are present and smoke-tested, but still
experimental.

## Canonical Flow

```text
GitHub issue
  -> triage
  -> plan
  -> approval
  -> implement
  -> verify
  -> review
  -> repair loop (if review is not clean, up to repair.max_rounds)
  -> approval before PR
  -> PR handoff
```

Hub also enforces review blast-radius controls from `WORKFLOW.md`:

- `review.max_changed_files`
  - if exceeded after `implement` or `repair`, Hub pauses for manual approval
- `review.run_max_changed_files`
  - if exceeded, Hub stops automatic continuation and marks the workflow failed with an explicit reason
- `review.max_patch_bytes`
  - if exceeded after `implement` or `repair`, Hub pauses for manual approval
- `review.run_max_patch_bytes`
  - if exceeded, Hub stops automatic continuation and marks the workflow failed with an explicit reason

## Bootstrap Local Development

Hub is the canonical bootstrap entrypoint for the four sibling repos.

Expected layout:

```text
<workspace-root>/
  devagent-sdk/
  devagent-runner/
  devagent/
  devagent-hub/
```

Bootstrap from the `devagent-hub` repo root:

```bash
bun install
bun run bootstrap:local
```

That script:

- verifies the sibling checkout layout
- clones missing sibling repos from the pinned baseline manifest
- checks out `main` in all four repos
- runs install/build in dependency order
- links the local CLIs so these commands are ready:
  - `devagent`
  - `devagent-runner`
  - `devagent-hub`

## CLI

```bash
devagent-hub project add
devagent-hub issue sync
devagent-hub run start --issue 42
devagent-hub run resume <workflow-id>
devagent-hub run reject <workflow-id> --note "expand rollback notes"
devagent-hub run cancel <workflow-id>
devagent-hub pr open <workflow-id>
devagent-hub pr repair <workflow-id>
devagent-hub list
devagent-hub status <workflow-id>
devagent-hub status <workflow-id> --json
devagent-hub tui --screen runs
```

## Review The Plan

When a workflow pauses after `plan`, you do not need to scrape logs. Use `status`.

Example:

```bash
devagent-hub run start --issue 42
devagent-hub status <workflow-id>
```

Default `status` output shows:

- workflow id
- current stage and status
- whether approval is pending
- latest artifact paths, including `plan.md`
- latest result or failure
- next recommended operator action

Typical output looks like:

```text
Workflow: 123e4567-e89b-12d3-a456-426614174000
Issue: #42 Fix run detail header
Stage: plan
Status: waiting_approval
Approval pending: yes (plan)
Status reason: none
Latest result: plan: success
Artifacts:
  plan: .devagent-runner/artifacts/task-42/plan.md
Approvals:
  plan: pending
Next action: Review the plan artifact, then run: devagent-hub run resume 123e4567-e89b-12d3-a456-426614174000
```

If the workflow is paused after `plan`, review the artifact directly:

```bash
cat .devagent-runner/artifacts/<task-id>/plan.md
```

Or use the exact path printed by `devagent-hub status <workflow-id>`.

Then choose:

```bash
devagent-hub run resume <workflow-id>
```

or:

```bash
devagent-hub run reject <workflow-id> --note "expand rollback notes and split migration from implementation"
```

How feedback is used:

- rejecting `plan` makes the note input to the next `plan` attempt
- Hub reruns `plan`
- the workflow pauses again on `plan` so a human can re-review the updated plan

Use `status --json` only for scripts or external tooling. The default text output is the intended
operator view.

## Review Before PR

After `implement -> verify -> review` completes cleanly, Hub pauses again before PR handoff.

Use:

```bash
devagent-hub status <workflow-id>
```

Review the latest:

- `verification-report.md`
- `review-report.md`
- `implementation-summary.md`

Then either open the PR:

```bash
devagent-hub pr open <workflow-id>
```

or reject and request more fixes:

```bash
devagent-hub run reject <workflow-id> --note "address security concerns before PR handoff"
```

How feedback is used:

- rejecting final pre-PR approval makes the note input to the next `repair`
- Hub reruns `repair -> verify -> review`
- the workflow pauses again before PR handoff

## Post-PR Feedback

`devagent-hub pr repair <workflow-id>` is only for an already-open PR. Use:

```bash
devagent-hub pr repair <workflow-id>
```

Hub fetches:

- GitHub review comments
- file/line context when GitHub provides it
- failing CI logs

That feedback becomes the next `repair` request context, together with changed-file hints and the
latest `review-report` / `verification-report`.

After repair succeeds, Hub reruns:

```text
repair -> verify -> review
```

and pushes the updated branch.

## Local Development Wiring

This repo currently consumes local packages through file dependencies:

- `@devagent-sdk/*` from `../devagent-sdk`
- `@devagent-runner/*` from `../devagent-runner`

That sibling layout is still MVP-only wiring, but the supported local path is now the bootstrap
script above rather than ad hoc manual setup.

## Development

```bash
bun install
bunx tsc --noEmit
bun run test
bun run build
```

Additional baseline commands:

```bash
bun run baseline:check
bun run baseline:drift
bun run baseline:compat
bun run baseline:smoke
```

`bun run test` uses Node-backed Vitest through [vitest.config.ts](vitest.config.ts) because the
canonical store is built on `better-sqlite3`, and local validation output under `.devagent-runner/`
is excluded from discovery.

## Validation

The pinned release-candidate baseline is recorded in [baseline.json](baseline.json), and the full
operator checklist lives in [BASELINE_VALIDATION.md](BASELINE_VALIDATION.md).

See [WORKFLOW.md](WORKFLOW.md) for repo-local workflow configuration semantics, including review size
limits and human approval behavior.
