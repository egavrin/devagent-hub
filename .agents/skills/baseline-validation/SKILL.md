---
name: baseline-validation
description: Update baseline manifests, validation scripts, and validation claims without breaking the pinned four-repo machine path.
---

# Baseline Validation

Use this when changing the pinned baseline, bootstrap assumptions, or any validation claim about
the supported DevAgent machine path.

## Key Files

- `baseline.json`
- `BASELINE_VALIDATION.md`
- `scripts/baseline/check-baseline.ts`
- `scripts/baseline/check-protocol-drift.ts`
- `src/baseline/manifest.ts`
- `src/__tests__/baseline-compatibility.test.ts`
- `src/__tests__/baseline-machine-path.test.ts`

## Rules

- The supported local layout is the sibling checkout of `devagent-sdk`, `devagent-runner`,
  `devagent`, and `devagent-hub`.
- Keep baseline claims consistent across `README.md`, `BASELINE_VALIDATION.md`, `WORKFLOW.md`, and
  CI workflows.
- Treat `baseline:check` as the strict pinned-manifest check and the other baseline commands as
  compatibility and machine-path validation.
- Do not describe adapters beyond DevAgent as production-grade unless the validation evidence says
  so.

## Verification

Run:

```bash
bun run baseline:drift
bun run baseline:compat
bun run baseline:smoke
```
