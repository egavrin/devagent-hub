# Testing

Tests use `bun test` (vitest-compatible). All test files are in `src/__tests__/`.

## Conventions

- Import from `vitest`: `describe, it, expect, beforeEach, afterEach`.
- Use `MockRunLauncher` from `src/runner/mock-launcher.ts` for launcher stubs — set responses per phase via `setResponse(phase, { exitCode, output })`.
- Use `MockGitHubGateway` from `src/github/mock-gateway.ts` for GitHub stubs — seed issues via `seedIssue(repo, issue)`.
- Use `MockReviewGate` returning `{ action: "proceed", reason: "Auto-pass" }` for gate stubs.
- Create temp SQLite DBs in `tmpdir()` with unique names: `hub-<test>-${Date.now()}.db`. Clean up in `afterEach`.
- Store creates tables on construction — no setup needed beyond `new StateStore(dbPath)`.

## Mock output format

All mock outputs must match the flat contract format the orchestrator expects:

```typescript
// review/gate phases
{ verdict: "pass", blockingCount: 0, summary: "Clean" }

// verify phase
{ summary: "Pass", passed: true }

// triage/plan/implement
{ summary: "..." }
```

## What to test

- Happy path: phase succeeds, correct artifact stored, correct status transition.
- Failure path: phase returns non-zero exit, correct status transition to `failed`.
- Input validation: required fields missing → exit code 2.
- State transitions: verify `assertTransition()` rejects invalid transitions.
- For new runners: at minimum test bin detection via `factory.getLauncher(phase).id`.
