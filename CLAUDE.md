@AGENTS.MD

IMPORTANT: Read and follow all instructions in `AGENTS.md` before starting any task.

This file is intentionally minimal. `AGENTS.md` is the canonical repo instruction source.

Additional reminders for Claude Code sessions:
- Keep changes aligned with the supported machine path: `devagent-hub` CLI -> `devagent-runner` -> `devagent execute`.
- Route executor integration work through `src/runner-client/`; do not add direct executor CLI wiring.
- Treat `README.md`, `BASELINE_VALIDATION.md`, and `WORKFLOW.md` as the operator-facing source of truth.
- Before finishing, run `bunx tsc --noEmit`, `bun run test`, `bun run build`, and `bun run check:oss`.
- Keep generated workflow artifacts under runner-managed directories, never in tracked docs or source paths.
