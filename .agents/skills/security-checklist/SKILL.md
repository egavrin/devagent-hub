---
name: security-checklist
description: Review Hub changes for command safety, secret handling, and unsafe workflow continuation.
---

# Security Checklist

Use this when reviewing changes to command execution, GitHub operations, workflow continuation, or
artifact handling.

## Command Safety

- Prefer `execFileSync` or typed library APIs over shell interpolation.
- Treat repo paths, branch names, workflow ids, PR numbers, and issue ids as data, not shell
  fragments.
- Keep command construction in helpers such as `src/runtime/node-runtime.ts` rather than duplicating
  quoting logic.

## Secrets And Artifacts

- Credentials must come from `gh`, environment variables, or local auth stores. Never hardcode
  tokens or persist them in repo-tracked files.
- Workflow artifacts may contain prompt or issue content. Do not dump full artifacts or raw result
  payloads to stdout without a specific reason.
- `.env` files and local auth material must not be committed.

## Workflow Safety

- Resume, PR open, and PR repair paths must validate the recorded baseline and branch expectations
  before continuing.
- Historical or stale runs should fail loudly with explicit reasons instead of continuing on the
  wrong branch or commit.
- Review-size limits and patch-size limits are safety rails, not optional hints.

## Persistence And Paths

- Keep workflow state changes inside `WorkflowService` and persisted through `CanonicalStore`.
- Use the store interface instead of ad hoc SQL in callers when extending persisted behavior.
- Build artifact and run paths from controlled components; do not let untrusted input choose output
  locations.

## Verification

Focus reviews on:

- `src/workflows/service.ts`
- `src/persistence/canonical-store.ts`
- `src/github/gh-cli-gateway.ts`
- `src/runtime/node-runtime.ts`

Run:

```bash
bun run test
bunx tsc --noEmit
```
