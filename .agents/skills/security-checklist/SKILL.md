# Security Checklist

When reviewing code changes, verify:

## Command injection
- No unsanitized user input in `execFileSync`/`execSync`/`spawn` arguments.
- Runner prompts use `JSON.stringify()` for dynamic data, never string interpolation into shell commands.
- `repoPath` and `runId` are used as file paths, not shell arguments.

## Secret handling
- API keys come from env vars, never hardcoded.
- `resolveEnv()` in LauncherFactory selectively passes only needed env vars.
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
