---
name: security-checklist
description: Review Hub and Runner changes for command safety, secret handling, and unsafe workflow continuation.
---

# Security Checklist

When reviewing code changes, verify:

## Command safety

- No unsanitized user input is passed into `execFileSync`, `exec`, `spawn`, or shell strings.
- Repo paths, task ids, workflow ids, and branch names are treated as data, not shell fragments.
- Dynamic prompt or request content is written to files or JSON payloads, not interpolated into shell commands.

## Secret handling

- Credentials come from `gh`, env vars, or local auth stores, never hardcoded.
- Logs and artifacts do not capture access tokens or other secrets.

## Workflow safety

- Resume/open/repair paths verify the recorded baseline and branch expectations before continuing.
- Historical or stale runs fail loudly instead of silently continuing on the wrong branch or commit.
- Artifact files may contain prompt content — don't log full artifacts to stdout.
- `.env` files must not be committed.

## Path traversal
- `artifactsDir`, `runDir` paths are built with `join()` from controlled components.
- `runId` and `phase` are validated before use in file paths.

## State integrity
- All status transitions go through `assertTransition()` — no direct DB writes.
- `deleteWorkflowRun()` cascades to artifacts and approval_requests.
- SQLite operations use parameterized queries (the `better-sqlite3` / `bun:sqlite` binding handles this).

## External runner trust
- Runner output is parsed as JSON — malformed output should fail gracefully, not crash.
- `parseJsonFromText()` extractors handle fences and free text without eval.
- Timeout is enforced on all `execFileSync` calls (default 15min).
- `maxBuffer` limits prevent memory exhaustion from verbose runners.
