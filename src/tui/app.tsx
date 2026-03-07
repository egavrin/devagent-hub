import React, { useReducer, useCallback, useEffect, useRef } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import type { StateStore } from "../state/store.js";
import type { ProcessRegistry } from "../runner/process-registry.js";
import type { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import type { AgentRun, ApprovalRequest } from "../state/types.js";
import { useWorkflowRuns } from "./hooks/use-workflow-runs.js";
import { useEventLog } from "./hooks/use-event-log.js";
import { useProcessOutput } from "./hooks/use-process-output.js";
import { useKeybindings } from "./hooks/use-keybindings.js";
import { KanbanBoard, KANBAN_COLUMNS } from "./components/kanban-board.js";
import { InputBar } from "./components/input-bar.js";
import { RunHeader } from "./components/run-header.js";
import { ArtifactPane } from "./components/artifact-pane.js";
import { TimelinePane } from "./components/timeline-pane.js";
import { LogPane } from "./components/log-pane.js";
import { ContextFooter } from "./components/context-footer.js";
import { uiReducer, initialUIState } from "./state.js";
import type { UIState } from "./state.js";

interface AppProps {
  store: StateStore;
  registry: ProcessRegistry;
  orchestrator: WorkflowOrchestrator;
}

export function App({ store, registry, orchestrator }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 40;
  const termWidth = stdout?.columns ?? 120;
  const runs = useWorkflowRuns(store);

  const [ui, dispatch] = useReducer(uiReducer, initialUIState);

  const selectedRun = runs.find((r) => r.id === ui.selectedRunId) ?? null;

  const agentRuns: AgentRun[] = selectedRun
    ? store.getAgentRunsByWorkflow(selectedRun.id)
    : [];

  const artifacts = selectedRun
    ? store.getArtifactsByWorkflow(selectedRun.id)
    : [];

  const transitions = selectedRun
    ? store.getTransitions(selectedRun.id)
    : [];

  const approvals: ApprovalRequest[] = selectedRun
    ? store.getApprovalsByWorkflow(selectedRun.id)
    : [];

  // Active process tracking
  const [activeProcessId, setActiveProcessId] = React.useState<string | null>(null);

  useEffect(() => {
    const onSpawn = (id: string) => setActiveProcessId(id);
    const onExit = (id: string) => {
      setActiveProcessId((cur) => (cur === id ? null : cur));
    };
    registry.on("spawn", onSpawn);
    registry.on("exit", onExit);
    const active = registry.list();
    if (active.length > 0) setActiveProcessId(active[active.length - 1].id);
    return () => {
      registry.off("spawn", onSpawn);
      registry.off("exit", onExit);
    };
  }, [registry]);

  // Event log for structured view
  const latestAgentRun = agentRuns.length > 0 ? agentRuns[agentRuns.length - 1] : null;
  const eventsPath = latestAgentRun
    ? latestAgentRun.eventsPath ?? `${require("os").homedir()}/.config/devagent-hub/artifacts/${latestAgentRun.id}/${latestAgentRun.phase}-events.jsonl`
    : null;
  const logEntries = useEventLog(eventsPath);

  // Raw output from process
  const outputLines = useProcessOutput(registry, activeProcessId);

  // Status message timer
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showStatus = useCallback((msg: string, persist = false) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    dispatch({ type: "SET_STATUS", message: msg });
    if (!persist) {
      statusTimer.current = setTimeout(() => dispatch({ type: "SET_STATUS", message: null }), 5000);
    }
  }, []);

  // ─── Navigation helpers ─────────────────────────────────────

  const getColumnRuns = useCallback((colIndex: number) => {
    const col = KANBAN_COLUMNS[colIndex];
    if (!col) return [];
    return runs.filter((r) => col.statuses.includes(r.status));
  }, [runs]);

  const handleNavigate = useCallback((direction: "up" | "down" | "left" | "right") => {
    if (ui.screen !== "dashboard") return;

    let newCol = ui.focusedColumnIndex;
    let newRow = ui.focusedRowIndex;

    if (direction === "left") {
      newCol = Math.max(0, ui.focusedColumnIndex - 1);
      newRow = 0;
    } else if (direction === "right") {
      newCol = Math.min(KANBAN_COLUMNS.length - 1, ui.focusedColumnIndex + 1);
      newRow = 0;
    } else if (direction === "up") {
      newRow = Math.max(0, ui.focusedRowIndex - 1);
    } else {
      const colRuns = getColumnRuns(ui.focusedColumnIndex);
      newRow = Math.min(Math.max(colRuns.length - 1, 0), ui.focusedRowIndex + 1);
    }

    dispatch({ type: "SET_FOCUSED_COLUMN", index: newCol });
    dispatch({ type: "SET_FOCUSED_ROW", index: newRow });

    const colRuns = getColumnRuns(newCol);
    if (colRuns[newRow]) {
      dispatch({ type: "SELECT_RUN", runId: colRuns[newRow].id });
    }
  }, [ui.screen, ui.focusedColumnIndex, ui.focusedRowIndex, getColumnRuns]);

  const handleSelect = useCallback(() => {
    if (ui.screen === "dashboard") {
      const colRuns = getColumnRuns(ui.focusedColumnIndex);
      const run = colRuns[ui.focusedRowIndex];
      if (run) {
        dispatch({ type: "OPEN_RUN", runId: run.id });
      }
    }
  }, [ui.screen, ui.focusedColumnIndex, ui.focusedRowIndex, getColumnRuns]);

  // ─── Run actions ─────────────────────────────────────────────

  const handleApprove = useCallback(() => {
    if (!selectedRun) return;
    if (selectedRun.status === "plan_draft" || selectedRun.status === "plan_revision") {
      orchestrator.approvePlan(selectedRun.issueNumber).then(
        () => showStatus(`Plan approved for #${selectedRun.issueNumber}`),
        (err: unknown) => showStatus(`Approve failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
  }, [selectedRun, orchestrator, showStatus]);

  const handleRework = useCallback(() => {
    if (!selectedRun) return;
    if (selectedRun.status !== "plan_draft") {
      showStatus("Rework only works on plan_draft status");
      return;
    }
    orchestrator.reworkPlan(selectedRun.issueNumber).then(
      () => showStatus(`Plan sent for rework #${selectedRun.issueNumber}`),
      (err: unknown) => showStatus(`Rework failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, [selectedRun, orchestrator, showStatus]);

  const handleContinue = useCallback(() => {
    if (!selectedRun) return;
    const issue = selectedRun.issueNumber;
    const status = selectedRun.status;

    const actions: Record<string, { label: string; fn: () => Promise<unknown> }> = {
      new: { label: "Triaging", fn: () => orchestrator.triage(issue) },
      triaged: { label: "Planning", fn: () => orchestrator.plan(issue) },
      plan_draft: { label: "Approving + implementing", fn: async () => {
        await orchestrator.approvePlan(issue);
        return orchestrator.implementAndPR(issue);
      }},
      plan_revision: { label: "Approving + implementing", fn: async () => {
        await orchestrator.approvePlan(issue);
        return orchestrator.implementAndPR(issue);
      }},
      plan_accepted: { label: "Implementing", fn: () => orchestrator.implementAndPR(issue) },
      awaiting_local_verify: { label: "Opening PR", fn: () => orchestrator.openPR(issue) },
      draft_pr_opened: { label: "Reviewing", fn: () => orchestrator.review(issue) },
      auto_review_fix_loop: { label: "Repairing", fn: () => orchestrator.repair(issue) },
      awaiting_human_review: {
        label: "Marking done",
        fn: async () => {
          store.updateStatus(selectedRun.id, "done", "Marked done via TUI");
          return store.getWorkflowRun(selectedRun.id);
        },
      },
    };

    const action = actions[status];
    if (!action) {
      showStatus(`Cannot continue from "${status}"`);
      return;
    }

    showStatus(`${action.label} #${issue}...`, true);
    action.fn().then(
      () => showStatus(`${action.label} complete for #${issue} -- press C to continue`),
      (err: unknown) => showStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, [selectedRun, orchestrator, store, showStatus]);

  const handleRetry = useCallback(() => {
    if (!selectedRun) return;
    if (selectedRun.status !== "failed") {
      showStatus("Retry only works on failed runs");
      return;
    }

    const issue = selectedRun.issueNumber;
    const phase = selectedRun.currentPhase;

    const phaseRetry: Record<string, { resetTo: string; label: string; fn: () => Promise<unknown> }> = {
      triage: {
        resetTo: "new",
        label: "Retrying triage",
        fn: () => {
          store.deleteWorkflowRun(selectedRun.id);
          return orchestrator.triage(issue);
        },
      },
      plan: {
        resetTo: "triaged",
        label: "Retrying plan",
        fn: () => {
          store.updateStatus(selectedRun.id, "triaged", "Reset for retry");
          return orchestrator.plan(issue);
        },
      },
      implement: {
        resetTo: "plan_accepted",
        label: "Retrying implement",
        fn: () => {
          store.updateStatus(selectedRun.id, "plan_accepted", "Reset for retry");
          return orchestrator.implementAndPR(issue);
        },
      },
      verify: {
        resetTo: "implementing",
        label: "Retrying verify",
        fn: () => {
          store.updateStatus(selectedRun.id, "implementing", "Reset for retry");
          return orchestrator.verify(issue);
        },
      },
      review: {
        resetTo: "draft_pr_opened",
        label: "Retrying review",
        fn: () => {
          store.updateStatus(selectedRun.id, "draft_pr_opened", "Reset for retry");
          return orchestrator.review(issue);
        },
      },
      repair: {
        resetTo: "auto_review_fix_loop",
        label: "Retrying repair",
        fn: () => {
          store.updateStatus(selectedRun.id, "auto_review_fix_loop", "Reset for retry");
          return orchestrator.repair(issue);
        },
      },
    };

    const retry = phase ? phaseRetry[phase] : phaseRetry["triage"];
    if (!retry) {
      showStatus(`Don't know how to retry phase "${phase}"`);
      return;
    }

    showStatus(`${retry.label} #${issue}...`, true);
    retry.fn().then(
      () => showStatus(`${retry.label} complete for #${issue} -- press C to continue`),
      (err: unknown) => showStatus(`Retry failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, [selectedRun, orchestrator, store, showStatus]);

  const handleKill = useCallback(() => {
    if (!activeProcessId) return;
    const mp = registry.get(activeProcessId);
    if (mp) {
      mp.kill();
      if (selectedRun) {
        store.updateStatus(selectedRun.id, "failed", "Killed by user via TUI");
        showStatus(`Killed agent for #${selectedRun.issueNumber}`);
      }
    }
  }, [activeProcessId, registry, selectedRun, store, showStatus]);

  const handleDelete = useCallback(() => {
    if (!selectedRun) return;
    const issueNum = selectedRun.issueNumber;
    store.deleteWorkflowRun(selectedRun.id);
    dispatch({ type: "SELECT_RUN", runId: null });
    if (ui.screen === "run") {
      dispatch({ type: "BACK" });
    }
    showStatus(`Deleted run for #${issueNum}`);
  }, [selectedRun, store, ui.screen, showStatus]);

  const handleNewRun = useCallback(() => {
    dispatch({ type: "SET_NEW_RUN_MODE", active: true });
  }, []);

  const handleNewRunSubmit = useCallback((text: string) => {
    const issueNumber = parseInt(text.trim(), 10);
    if (!issueNumber || isNaN(issueNumber)) {
      showStatus("Invalid issue number");
      dispatch({ type: "SET_NEW_RUN_MODE", active: false });
      return;
    }
    dispatch({ type: "SET_NEW_RUN_MODE", active: false });
    showStatus(`Triaging #${issueNumber}...`);
    orchestrator.triage(issueNumber).then(
      (run) => {
        dispatch({ type: "OPEN_RUN", runId: run.id });
        showStatus(`#${issueNumber}: ${run.status} -- press C to continue`);
      },
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        showStatus(`Failed: ${msg}`);
      },
    );
  }, [orchestrator, showStatus]);

  const handleSendInput = useCallback((text: string) => {
    if (!activeProcessId) return;
    const mp = registry.get(activeProcessId);
    mp?.sendInput(text + "\n");
  }, [activeProcessId, registry]);

  const handleOpenExternal = useCallback(() => {
    if (!selectedRun?.prUrl) {
      showStatus("No PR URL to open");
      return;
    }
    showStatus(`PR: ${selectedRun.prUrl}`);
  }, [selectedRun, showStatus]);

  const handleApprovalsView = useCallback(() => {
    dispatch({ type: "SET_SCREEN", screen: "approvals" });
  }, []);

  // ─── Keybindings ─────────────────────────────────────────────

  useKeybindings({
    onNavigate: handleNavigate,
    onSelect: handleSelect,
    onNextPane: () => dispatch({ type: "NEXT_PANE" }),
    onPrevPane: () => dispatch({ type: "PREV_PANE" }),
    onSetLogMode: (mode) => dispatch({ type: "SET_LOG_MODE", mode }),
    onApprove: handleApprove,
    onContinue: handleContinue,
    onRetry: handleRetry,
    onKill: handleKill,
    onDelete: handleDelete,
    onNewRun: handleNewRun,
    onQuit: () => exit(),
    onEnterInput: () => dispatch({ type: "SET_INPUT_MODE", active: true }),
    onExitInput: () => dispatch({ type: "SET_INPUT_MODE", active: false }),
    onBack: () => dispatch({ type: "BACK" }),
    onRework: handleRework,
    onOpenExternal: handleOpenExternal,
    onApprovalsView: handleApprovalsView,
  }, ui.screen, ui.inputMode || ui.newRunMode);

  // ─── Render ──────────────────────────────────────────────────

  const paneHeight = Math.max(8, Math.floor((termHeight - 10) / 2));

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* ── Run Focus screen ──────────────────────────────── */}
      {ui.screen === "run" && selectedRun ? (
        <>
          <Box borderStyle="single" borderColor="blue" flexShrink={0}>
            <RunHeader run={selectedRun} isActive={!!activeProcessId} />
          </Box>

          <Box flexGrow={1} flexDirection="row" overflow="hidden">
            {/* Left: Artifact pane */}
            <Box flexGrow={1} flexBasis={0} flexDirection="column">
              <ArtifactPane
                artifacts={artifacts}
                approvals={approvals}
                isFocused={ui.focusedPane === "artifact"}
                height={paneHeight * 2}
              />
            </Box>

            {/* Right: Timeline + Logs stacked */}
            <Box flexGrow={1} flexBasis={0} flexDirection="column">
              <TimelinePane
                agentRuns={agentRuns}
                transitions={transitions}
                artifacts={artifacts}
                isFocused={ui.focusedPane === "timeline"}
                height={paneHeight}
              />
              <LogPane
                selectedRun={selectedRun}
                logMode={ui.logMode}
                events={logEntries.map((e) => ({
                  timestamp: e.timestamp,
                  type: "output" as const,
                  summary: e.text,
                }))}
                outputLines={outputLines}
                isFocused={ui.focusedPane === "logs"}
              />
            </Box>
          </Box>
        </>
      ) : ui.screen === "approvals" ? (
        /* ── Approvals screen (placeholder, will be expanded in M2) ── */
        <Box flexDirection="column" flexGrow={1} padding={1}>
          <Text bold>Pending Approvals</Text>
          <Text dimColor>Press Esc to go back</Text>
          {runs
            .filter((r) => r.status === "plan_draft" || r.status === "awaiting_human_review")
            .map((r) => (
              <Text key={r.id}>
                <Text color="yellow">#{r.issueNumber}</Text>
                {" "}
                <Text>{r.status}</Text>
                {" "}
                <Text dimColor>{(r.metadata as Record<string, unknown>)?.title as string ?? ""}</Text>
              </Text>
            ))
          }
          {runs.filter((r) => r.status === "plan_draft" || r.status === "awaiting_human_review").length === 0 && (
            <Text dimColor>No pending approvals</Text>
          )}
        </Box>
      ) : (
        /* ── Dashboard screen ─────────────────────────────── */
        <>
          <KanbanBoard
            runs={runs}
            selectedRunId={ui.selectedRunId}
            activeRunId={activeProcessId}
            focusedColumnIndex={ui.focusedColumnIndex}
            isFocused={true}
          />
          {selectedRun && (
            <Box paddingLeft={1} flexShrink={0}>
              <Text bold color={activeProcessId ? "green" : "white"}>
                #{selectedRun.issueNumber}{" "}
                {((selectedRun.metadata as Record<string, unknown>)?.title as string) ?? ""}{" "}
                [{selectedRun.status}]
                {selectedRun.currentPhase ? ` phase:${selectedRun.currentPhase}` : ""}
                {activeProcessId ? " RUNNING" : ""}
              </Text>
            </Box>
          )}
          {!selectedRun && (
            <Box paddingLeft={1} flexShrink={0}>
              <Text dimColor>No task selected -- press N to start a new run</Text>
            </Box>
          )}
          {/* Inline logs below kanban */}
          <Box
            borderStyle="single"
            borderColor="gray"
            flexDirection="column"
            flexGrow={1}
            paddingLeft={1}
            overflow="hidden"
          >
            {logEntries.length === 0 ? (
              <Text dimColor>No logs yet -- select a task and press C to continue</Text>
            ) : (
              logEntries.slice(-(termHeight - 16)).map((entry, i) => (
                <Text key={i} wrap="truncate">
                  <Text dimColor>{entry.timestamp.slice(11, 19)} </Text>
                  {entry.text}
                </Text>
              ))
            )}
          </Box>
        </>
      )}

      {/* ── New run input ─────────────────────────────────── */}
      {ui.newRunMode && (
        <Box paddingLeft={1} flexShrink={0}>
          <Text color="green">Issue #: </Text>
          <TextInput
            value={ui.newRunInput}
            onChange={(v) => dispatch({ type: "SET_NEW_RUN_INPUT", value: v })}
            onSubmit={handleNewRunSubmit}
          />
          <Text dimColor>  Enter to start, Esc to cancel</Text>
        </Box>
      )}

      {/* ── Input bar ─────────────────────────────────────── */}
      <InputBar
        isActive={ui.inputMode && !ui.newRunMode}
        onSubmit={handleSendInput}
      />

      {/* ── Status message ────────────────────────────────── */}
      {ui.statusMessage && (
        <Box paddingLeft={1} flexShrink={0}>
          <Text color="yellow">{ui.statusMessage}</Text>
        </Box>
      )}

      {/* ── Contextual footer ─────────────────────────────── */}
      <ContextFooter
        screen={ui.screen}
        inputMode={ui.inputMode}
        runStatus={selectedRun?.status}
        hasActiveProcess={!!activeProcessId}
      />
    </Box>
  );
}
