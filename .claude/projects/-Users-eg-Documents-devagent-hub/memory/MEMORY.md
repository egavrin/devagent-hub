# devagent-hub Memory

## Project Overview
- Terminal-based orchestrator for AI coding agents (DevAgent, Codex, OpenCode)
- Stack: TypeScript, Bun, Ink (React for CLI), SQLite (bun:sqlite), Vitest
- TUI is the primary interface — run-centric, not board-centric

## Key Architecture
- `src/tui/` — Ink-based TUI with state managed via `useReducer` + `UIState` in `state.ts`
- `src/state/store.ts` — SQLite-backed state (workflow_runs, agent_runs, artifacts, approval_requests)
- `src/workflow/orchestrator.ts` — Workflow engine with assisted + watch modes
- `src/runner/` — Process management (streaming-launcher, process-registry)
- `src/github/` — GitHub gateway (REST via gh CLI)

## TUI State Model (PR 1-3 refactor)
- Screens: `dashboard | run | approvals`
- Panes: `queue | artifact | timeline | logs`
- Log modes: `structured | raw`
- State lives in `src/tui/state.ts` (UIState + uiReducer)
- Keybindings in `src/tui/hooks/use-keybindings.ts`

## Key Components (after refactor)
- `app.tsx` — AppShell using UIState reducer, 3 screens
- `run-header.tsx` — Rich header with status, phase, next action hint
- `artifact-pane.tsx` — Latest artifact + verdict badges + history
- `timeline-pane.tsx` — Merged agent runs + gates + transitions
- `context-footer.tsx` — Context-sensitive keybinding hints
- `log-pane.tsx` — Structured/raw log toggle (S/L keys)
- `run-card.tsx` — Phase badge, age, repair round

## Known Issues
- 2 pre-existing test failures in `orchestrator-watch.test.ts` (status "done" vs expected "awaiting_human_review")
- `status-bar.tsx` and `detail-panel.tsx` are legacy — kept for compatibility but not used by main app

## Workflow Statuses
new -> triaged -> plan_draft -> plan_accepted -> implementing -> awaiting_local_verify -> draft_pr_opened -> auto_review_fix_loop/awaiting_human_review -> done
Also: plan_revision, escalated, failed, ready_to_merge
