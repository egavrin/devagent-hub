# DevAgent Hub

## Repository Identity

DevAgent Hub is the workflow orchestrator for the DevAgent stack. It owns issue import, workflow
state, approvals, persistence, operator CLI flows, and PR handoff.

- Runtime: Bun + TypeScript (ESM)
- Tests: Vitest via `bun run test`
- Database: SQLite via `better-sqlite3`
- Config: frontmatter in `WORKFLOW.md`

The supported machine path is:

```text
devagent-hub CLI -> devagent-runner -> devagent execute -> artifacts/events/results -> devagent-hub
```

Hub does not launch executors directly and no longer ships a TUI surface.

## Repository Layout

```text
src/
  baseline/       # Baseline manifest and validation helpers
  bootstrap/      # Local sibling-repo bootstrap flow
  canonical/      # Canonical persisted workflow/task/approval types
  cli/            # Operator CLI entrypoint
  github/         # GitHub gateway and helpers
  persistence/    # SQLite-backed canonical store
  runner-client/  # Runner integration boundary
  runtime/        # Node runtime resolution and command helpers
  workflow/       # WORKFLOW.md parsing, skill resolution, guardrails
  workflows/      # Canonical workflow service/orchestration
  __tests__/      # Test suite
.agents/skills/   # Repo-local Codex skills
scripts/          # Bootstrap, baseline, and OSS checks
docs/             # Operator-facing support docs and archived design notes
```

Treat `.devagent-runner/` as runner-managed output, not a source component. Its workspaces and
artifacts are generated state and should not drive documentation or architecture decisions.

## Build, Test, And Run Entry Points

Prerequisites:

- Bun `1.3.10+`
- Node `20+`
- sibling checkout of `devagent-sdk`, `devagent-runner`, `devagent`, and `devagent-hub`

Bootstrap local development from the repo root:

```bash
bun install
bun run bootstrap:local
```

Canonical validation commands:

```bash
bunx tsc --noEmit
bun run test
bun run build
bun run baseline:drift
bun run baseline:compat
bun run baseline:smoke
bun run check:oss
```

Core operator commands:

```bash
devagent-hub issue sync
devagent-hub run start --issue 42
devagent-hub status <workflow-id>
devagent-hub run resume <workflow-id>
devagent-hub run reject <workflow-id> --note "expand rollback notes"
devagent-hub pr open <workflow-id>
devagent-hub pr repair <workflow-id>
```

## Architecture And Workflows

- Keep the CLI as the only operator surface. `status` is the review UI.
- Route execution through `src/runner-client/`; do not add direct executor CLI wiring.
- `WorkflowService` in `src/workflows/service.ts` owns staged orchestration, approvals, repair
  loops, and PR handoff decisions.
- Persist workflow, task, attempt, approval, artifact, and issue-unit state through
  `CanonicalStore`; do not reintroduce legacy state models.
- `WORKFLOW.md` is the runtime contract for runner selection, profiles, skills, verify commands,
  review size limits, repair behavior, and PR rules.
- Baseline and stale-state checks are safety features. Resume, PR open, and PR repair flows should
  fail explicitly when the recorded baseline no longer matches the current workspace.
- The validated production path is DevAgent-only today. Other adapters may exist, but they remain
  experimental until they have comparable live validation.

## Conventions And Pitfalls

- Treat `README.md`, `BASELINE_VALIDATION.md`, `WORKFLOW.md`, and this file as the operator-facing
  source of truth. Keep them aligned when behavior changes.
- Keep generated workflow artifacts under runner-managed directories. Do not move them into tracked
  source or docs paths.
- Do not reintroduce removed TUI or alternate UI surfaces in code or docs.
- Keep review-size limits and stale-state checks enforced; they are not optional policy.
- Prefer updating tests in `src/__tests__/` alongside behavior changes, especially for workflow
  orchestration, persistence, runner integration, baseline validation, and documentation parity.
- Keep repo-local skills aligned with the current repo; they are active guidance surfaces, not
  scratch notes.

## Local Skills

- `runner-integration`
  Use for Hub-to-Runner request/event/result changes through the canonical SDK path.
- `security-checklist`
  Use when reviewing command execution, secret handling, baseline safety, and unsafe continuation
  risks.
- `state-machine`
  Use for workflow-definition, approval-loop, issue-unit, and stage-progression changes.
- `testing`
  Use when adding or updating tests across workflow service, canonical store, runner client,
  baseline, and documentation parity coverage.
- `baseline-validation`
  Use when changing `baseline.json`, baseline scripts, bootstrap assumptions, or validation claims
  in the docs.
