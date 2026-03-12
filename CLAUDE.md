IMPORTANT: Read and follow all instructions in `AGENTS.md` before starting any task.

This repository uses `AGENTS.md` as the primary agent instruction source.

## Quick guidance

- Treat `AGENTS.md` as authoritative for workflow, validation, and repository rules.
- Keep changes aligned with the supported machine path:
  `devagent-hub CLI -> devagent-runner -> devagent execute -> artifacts/events/results -> devagent-hub`
- Route execution changes through `src/runner-client/`.
- Persist workflow state through `CanonicalStore`.
- Use the CLI as the operator surface; `status` is the review UI.
- Keep generated workflow artifacts out of tracked source/docs paths.

## Before finishing

Run the required project checks from `AGENTS.md`:

- `bunx tsc --noEmit`
- `bun run test`
- `bun run build`
- `bun run check:oss`

If any instruction here conflicts with `AGENTS.md`, follow `AGENTS.md`.
