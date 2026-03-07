# DevAgent Hub

Workflow control plane for AI coding agents. Orchestrates issue→PR lifecycle across multiple runner backends (devagent, opencode, claude, codex).

## Commands

```sh
bun test              # run tests (must all pass)
bunx tsc --noEmit     # typecheck (must be clean)
```

## Architecture

- `src/workflow/orchestrator.ts` — core state machine, phase execution
- `src/runner/` — runner adapters (RunnerAdapter interface)
- `src/state/store.ts` — SQLite persistence, state transitions
- `src/workflow/config.ts` — WORKFLOW.md parsing, validation
- `src/tui/` — Ink/React terminal UI

## Conventions

- ESM only, `node:` prefixed imports
- Tests in `src/__tests__/`, use vitest API with `bun test`
- Mock launchers: `MockRunLauncher.setResponse(phase, { exitCode, output })`
- All runner outputs are flat JSON matching phase schemas
- State transitions enforced by `assertTransition()` — never write status directly
