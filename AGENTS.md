# DevAgent Hub — Agent Instructions

## What this project is

DevAgent Hub is the workflow orchestrator for the DevAgent stack. It owns issue import, workflow
state, approvals, persistence, operator CLI flows, and PR handoff.

The supported machine path is:

```text
devagent-hub CLI -> devagent-runner -> devagent execute -> artifacts/events/results -> devagent-hub
```

Hub does not launch executors directly and no longer ships a TUI surface.

## Tech stack

- **Runtime**: Bun + TypeScript (ESM)
- **Tests**: Vitest via `bun run test`
- **Database**: SQLite via `better-sqlite3`
- **Config**: frontmatter in `WORKFLOW.md`

## Project structure

```text
src/
  baseline/       # Baseline manifest and validation helpers
  bootstrap/      # Local sibling-repo bootstrap flow
  canonical/      # Canonical persisted workflow/task/approval types
  cli/            # Operator CLI entrypoint
  github/         # GitHub gateway and helpers
  persistence/    # SQLite-backed canonical store
  runner-client/  # Runner integration boundary
  workflow/       # WORKFLOW.md parsing, skills, guardrails
  workflows/      # Canonical workflow service/orchestration
  __tests__/      # Test suite
```

## Key commands

```sh
bun test
bunx tsc --noEmit
bun run build
bun run baseline:drift
bun run baseline:compat
bun run baseline:smoke
```

## Rules

1. Keep the CLI as the only operator surface. `status` is the review UI.
2. Route execution through `src/runner-client/`; do not add direct executor CLI wiring.
3. Persist workflow/task/attempt/approval state through `CanonicalStore`; do not reintroduce legacy state models.
4. Treat `README.md`, `BASELINE_VALIDATION.md`, and `WORKFLOW.md` as the operator-facing source of truth.
5. Experimental runner adapters may exist, but only the DevAgent path is production-grade for MVP work.
6. Run `bunx tsc --noEmit`, `bun run test`, `bun run build`, and `bun run check:oss` before finishing.
7. Keep generated workflow artifacts under runner-managed directories, never in repo-tracked docs or source paths.
8. Treat review-size limits and stale-state checks as safety features, not optional policy.
