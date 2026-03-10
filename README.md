# DevAgent Hub

Canonical workflow orchestrator for the DevAgent stack.

Hub owns issue import, workflow state, task generation, approvals, persistence, TUI/CLI operator
surfaces, and PR handoff. It does not launch executors directly. Hub resolves an `ExecutorSpec`,
submits an SDK request to `devagent-runner`, ingests normalized events/results/artifacts, and drives
the staged workflow around them.

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

The current live-validated executor path is `devagent` with `provider: chatgpt` and
`model: gpt-5.4`.

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
devagent-hub tui --screen runs
```

## Human Review

Hub has two hard approval checkpoints:

- after `plan`
- before PR creation

Operator actions:

- approve the plan with `run resume`
- reject and rerun the plan with `run reject --note "..."`
- approve PR handoff with `pr open`
- reject the final pre-PR review with `run reject --note "..."`

For an already-open PR, use `pr repair <workflow-id>` to turn GitHub review comments and failing CI
logs into a `repair -> verify -> review` cycle on the existing workflow branch.

## TUI

The canonical TUI exposes four views:

- `Inbox`: imported GitHub issues
- `Runs`: active and completed workflow instances
- `Run Detail`: tasks, attempts, events, artifacts, approvals
- `Settings`: project and executor availability

## Local Development Wiring

This repo consumes local packages through file dependencies:

- `@devagent-sdk/types` from `../devagent-sdk/packages/types`
- `@devagent-runner/adapters` from `../devagent-runner/packages/adapters`
- `@devagent-runner/local-runner` from `../devagent-runner/packages/local-runner`

The local runner in turn reaches `../devagent/packages/cli/dist/index.js` for the `devagent execute`
machine entrypoint.

## Development

```bash
bun install
bunx tsc --noEmit
bun run test
bun run build
```

`bun run test` uses Node-backed Vitest through [vitest.config.ts](/Users/eg/Documents/devagent-hub/vitest.config.ts)
because the canonical store is built on `better-sqlite3`, and local validation output under
`.devagent-runner/` must be excluded from test discovery.

## Validation

The intended end-to-end loop is:

```text
project add -> issue sync -> run start -> run resume -> pr open
```

That path has unit coverage for canonical persistence, workflow progression, approval pause/resume,
runner event ingestion, rejection/replan behavior, post-PR repair behavior, PR handoff, and the
canonical TUI views.
