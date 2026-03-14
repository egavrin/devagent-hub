---
name: testing
description: Verify Hub changes with workflow-service, canonical-store, runner-client, baseline, and documentation-parity tests.
---

# Testing

Hub tests run through Vitest. Most coverage lives in `src/__tests__/`.

## Conventions

- Exercise orchestration through `WorkflowService` and persistence through `CanonicalStore`.
- Prefer temp directories, temp git repos, and isolated SQLite databases over mutating shared state.
- Keep documentation-facing changes covered by `documentation.test.ts` when active guidance files
  change.
- Baseline compatibility and machine-path tests are intentionally gated; run them when changing the
  SDK or runner boundary.

## Key Suites

- `src/__tests__/workflow-service.test.ts`
- `src/__tests__/canonical-store.test.ts`
- `src/__tests__/local-runner-client.test.ts`
- `src/__tests__/workflow-config.test.ts`
- `src/__tests__/skill-resolver.test.ts`
- `src/__tests__/documentation.test.ts`
- `src/__tests__/baseline-compatibility.test.ts`
- `src/__tests__/baseline-machine-path.test.ts`

## Verification

Run the standard repo checks:

```bash
bun run test
bunx tsc --noEmit
bun run build
bun run check:oss
```

Run the heavier baseline checks when runner, SDK contract, or baseline behavior changes:

```bash
bun run baseline:drift
bun run baseline:compat
bun run baseline:smoke
```
