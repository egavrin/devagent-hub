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

## Key Components (after M2+M3 refactor)
- `app.tsx` — AppShell using UIState reducer, 3 screens, dialog system
- `run-header.tsx` — Rich header with status, phase, next action hint, gate chain (M3), watch mode badge
- `artifact-pane.tsx` — Latest artifact + verdict badges + review findings detail + plan sections + history
- `timeline-pane.tsx` — Merged agent runs + gates + transitions
- `context-footer.tsx` — Context-sensitive keybinding hints per screen
- `log-pane.tsx` — Structured/raw log toggle (S/L keys)
- `run-card.tsx` — Phase badge, age, repair round
- `new-run-dialog.tsx` — Source type (issue/PR), mode (assisted/watch)
- `rework-dialog.tsx` — Feedback note input for plan rework
- `approval-queue-view.tsx` — Navigable list of pending approvals + blocked runs
- `why-paused-panel.tsx` — Explains why a run is paused/blocked/failed with suggestions

## Data Model
- WorkflowRun now has `sourceType` ("issue" | "pr") and `mode` ("assisted" | "watch") as first-class DB fields
- Store has auto-migration for existing DBs (adds columns if missing)
- `store.listAll()` returns all runs sorted by updated_at DESC
- `store.listPendingApprovals()` returns all unresolved approvals across runs

## Cleanup Done
- Dead components removed: `detail-panel.tsx`, `status-bar.tsx`, `run-detail.tsx`
- Watch mode tests fixed: expectations updated to match auto-complete behavior (done, not awaiting_human_review)
- `useWorkflowRuns` now uses `store.listAll()` instead of per-status queries

## Workflow Statuses
new -> triaged -> plan_draft -> plan_accepted -> implementing -> awaiting_local_verify -> draft_pr_opened -> auto_review_fix_loop/awaiting_human_review -> done
Also: plan_revision, escalated, failed, ready_to_merge
