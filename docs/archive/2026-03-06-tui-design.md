# Archived Plan

This document is historical. It describes a removed TUI surface and pre-cutover Hub architecture.
It does not match the current implementation. Use [`README.md`](../../README.md),
[`BASELINE_VALIDATION.md`](../../BASELINE_VALIDATION.md), and
[`WORKFLOW.md`](../../WORKFLOW.md) for the current source of truth.

# TUI Design: Interactive Kanban Dashboard for devagent-hub

**Date:** 2026-03-06
**Status:** Approved

## Overview

An interactive terminal UI (TUI) built with Ink (React for CLI) that provides a kanban board view of workflow runs, live agent log streaming, structured event parsing, and full interactive agent communication.

Launched via `devagent-hub ui`.

## Architecture

### Data Flow

```
StateStore (SQLite) <-> WorkflowOrchestrator
                            |
                      ProcessRegistry (spawn handles)
                            | events
                      Ink App (React state -> render)
                            ^ keyboard input
                         User
```

### Launcher Rework

Replace `execFileSync` with `child_process.spawn`. New classes:

**ManagedProcess** — wraps a spawned agent subprocess:
- `id: string` (agentRunId)
- `phase: string`
- `process: ChildProcess`
- `stdout$: EventEmitter` — emits `data` with string chunks
- `stderr$: EventEmitter` — emits `data` with string chunks
- `sendInput(text: string): void` — writes to stdin
- `kill(): void`
- `onExit: Promise<{ exitCode: number }>`

**ProcessRegistry extends EventEmitter** — singleton tracking all active processes:
- `spawn(params): ManagedProcess`
- `get(agentRunId): ManagedProcess | null`
- `list(): ManagedProcess[]`
- Emits: `spawn`, `output`, `exit`

**StreamingLauncher** — implements the launcher interface but returns immediately, manages process lifecycle asynchronously. Existing `RunLauncher` kept for non-TUI commands.

**EventParser** — watches `<phase>-events.jsonl` via `fs.watch`, tails new lines, parses each as JSON:

```typescript
interface AgentEvent {
  timestamp: string;
  type: 'tool_call' | 'tool_result' | 'thinking' | 'output' | 'error';
  name?: string;
  summary?: string;
  detail?: unknown;
}
```

Unknown event types render as generic log lines.

## Screen Layout

```
+- Triage --+- Planning -+- Building -+- Review ---+- Done -+- Blocked -+
| #7 myrepo | #12 repo2  | >#15 repo  |            | #3 ok  | #9 fail   |
|   triaged |  plan_draft|  implement |            |        |  failed   |
|           |            |            |            |        |           |
+-----------|------------+------------+------------+--------+-----------+
| > #15 myrepo/repo -- implementing                    [S]truct [L]og  |
|                                                                       |
| 14:02:31 * phase:implement started                                    |
| 14:02:33 * tool:read src/index.ts                                     |
| 14:02:35 * tool:edit src/index.ts (lines 42-58)                       |
| 14:02:40 * tool:bash bun test                                         |
| 14:03:01 * test:pass 12/12                                            |
|                                                                       |
| > _                                                      [input mode] |
+-----------------------------------------------------------------------+
| up/dn select  Tab pane  Enter select  A approve  R retry              |
| I input  K kill  Q quit  S structured  L raw logs  N new              |
+-----------------------------------------------------------------------+
```

### Kanban Column Grouping

| Column     | Statuses                                             |
|------------|------------------------------------------------------|
| Triage     | `new`, `triaged`                                     |
| Planning   | `plan_draft`, `plan_revision`, `plan_accepted`       |
| Building   | `implementing`, `awaiting_local_verify`              |
| Review     | `draft_pr_opened`, `auto_review_fix_loop`, `awaiting_human_review` |
| Done       | `ready_to_merge`, `done`                             |
| Blocked    | `escalated`, `failed`                                |

### Ink Component Tree

```
<App>
  <KanbanBoard>
    <Column title="Triage">
      <RunCard />
    </Column>
    ...
  </KanbanBoard>
  <LogPane>
    <StructuredView />    -- parsed events timeline (default)
    <RawLogView />        -- raw stdout/stderr stream (toggle L)
    <InputBar />          -- text input for agent stdin
  </LogPane>
  <StatusBar />           -- keybinding hints
</App>
```

### Structured Event View Icons

- `*` tool call (read, edit, bash, etc.)
- `ok` / `fail` tool result
- `>>` phase transition
- `!` error

## Key Bindings

| Key       | Action                                    |
|-----------|-------------------------------------------|
| `up/dn` `j/k` | Navigate cards in kanban             |
| `left/right` `h/l` | Move between columns            |
| `Tab`     | Switch focus between kanban and log pane  |
| `Enter`   | Select card to view in log pane           |
| `S`       | Structured event view                     |
| `L`       | Raw log view                              |
| `I`       | Enter interactive input mode              |
| `Esc`     | Exit input mode                           |
| `A`       | Approve (at gate points like plan_draft)  |
| `R`       | Retry failed run                          |
| `K`       | Kill running agent                        |
| `N`       | Start new workflow (prompts issue number) |
| `Q`       | Quit TUI                                  |

## Agent Interaction

### Interactive stdin

1. User presses `I` -- input bar focuses
2. User types message, presses `Enter`
3. TUI calls `processRegistry.get(agentRunId).sendInput(text + '\n')`
4. Written to agent's stdin pipe
5. Input bar shows "Sent" briefly, clears

### Gate Actions

- `A` -> `orchestrator.approvePlan(issueNumber)`
- `R` -> `orchestrator.triage(issueNumber)` (restart)
- `K` -> `managedProcess.kill()` + `store.updateStatus(id, 'failed', 'killed by user')`

## File Structure

```
src/tui/
  app.tsx                   # Root Ink <App> component
  index.tsx                 # Entry point, renders <App>
  event-parser.ts           # JSONL file watcher + parser
  components/
    kanban-board.tsx
    column.tsx
    run-card.tsx
    log-pane.tsx
    structured-view.tsx
    raw-log-view.tsx
    input-bar.tsx
    status-bar.tsx
  hooks/
    use-workflow-runs.ts    # Polls StateStore for run data
    use-process-output.ts   # Subscribes to ProcessRegistry events
    use-keybindings.ts      # Keyboard input handling

src/runner/
  launcher.ts               # Existing (kept for non-TUI)
  streaming-launcher.ts     # New spawn-based launcher
  managed-process.ts        # ManagedProcess class
  process-registry.ts       # ProcessRegistry singleton
```

## Dependencies

```
ink                  # React for CLI
react                # Peer dep for Ink
ink-text-input       # Text input component
```

## CLI Change

Add `ui` command to `src/cli/index.ts`. All existing commands unchanged.
