# DevAgent Hub — Agent Instructions

## What this project is

DevAgent Hub is a workflow control plane that orchestrates AI coding agents. It manages the lifecycle of issue-to-PR workflows: triage → plan → implement → verify → review → repair → done.

## Tech stack

- **Runtime**: Bun (TypeScript, ESM)
- **Tests**: `bun test` (vitest-compatible, uses `bun:sqlite`)
- **TUI**: Ink (React for CLI)
- **DB**: SQLite via `bun:sqlite`
- **Config**: YAML frontmatter in WORKFLOW.md

## Project structure

```
src/
  cli/           # CLI entry point, commands, argument parsing
  runner/        # Runner adapters (devagent, opencode, claude, codex)
  state/         # SQLite store, types, state machine
  workflow/      # Orchestrator, config, review gates, autopilot, skill resolver
  tui/           # Ink/React terminal UI components
  github/        # GitHub API gateway
  workspace/     # Git worktree management
  __tests__/     # All tests
.agents/skills/  # Skill definitions (SKILL.md per skill)
```

## Key commands

```sh
bun test              # run all tests
bunx tsc --noEmit     # typecheck
bun run build         # build CLI
```

## Rules

1. **Always run `bun test` after changes** — all 222+ tests must pass.
2. **Never skip typecheck** — `bunx tsc --noEmit` must be clean.
3. **Runner adapters** must implement `RunnerAdapter` from `src/runner/runner-adapter.ts`. See `.agents/skills/runner-integration/SKILL.md`.
4. **State transitions** are enforced by `assertTransition()`. See `.agents/skills/state-machine/SKILL.md`.
5. **Mock outputs** must use the flat contract format (see `.agents/skills/testing/SKILL.md`).
6. **No `require()` in source files** — this is an ESM project. Use `import`.
7. **Prefer `node:` prefixed imports** — `node:fs`, `node:path`, `node:child_process`.
