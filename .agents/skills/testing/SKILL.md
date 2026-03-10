---
name: testing
description: Verify Hub changes with canonical-store, workflow-service, baseline, and TUI tests.
---

# Testing

Hub tests run through Vitest. Most coverage lives in `src/__tests__/`.

## Conventions

- Import test helpers from `vitest`.
- Use temp SQLite DBs and clean them up in `afterEach`.
- Exercise orchestration through `WorkflowService`, not through ad hoc store mutation.
- Prefer the canonical-path tests:
  - `workflow-service.test.ts`
  - `canonical-store.test.ts`
  - `baseline-compatibility.test.ts`
  - `baseline-machine-path.test.ts`
  - `tui.test.tsx`

## Verification

Run the same checks the repo documents:

```bash
node ./node_modules/vitest/vitest.mjs run --config vitest.config.ts
bunx tsc --noEmit
bun run build
```

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
