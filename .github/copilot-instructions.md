This is devagent-hub — a workflow control plane for AI coding agents.

- Runtime: Bun, TypeScript, ESM
- Tests: `bun test` (vitest-compatible)
- TUI: Ink (React for CLI)
- DB: SQLite via `bun:sqlite`

Use `node:` prefixed imports. No `require()`. All tests in `src/__tests__/`.
Runner adapters implement `RunnerAdapter` from `src/runner/runner-adapter.ts`.
State transitions enforced by `assertTransition()` in `src/state/store.ts`.

Commit messages: conventional commits format (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
