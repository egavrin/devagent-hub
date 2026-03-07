import React, { useReducer, useCallback, useEffect, useRef } from "react";
import { Box, Text, useApp, useStdout } from "ink";
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
import { NewRunDialog } from "./components/new-run-dialog.js";
import { ReworkDialog } from "./components/rework-dialog.js";
import { ApprovalQueueView } from "./components/approval-queue-view.js";
import type { ApprovalQueueItem } from "./components/approval-queue-view.js";
import { WhyPausedPanel } from "./components/why-paused-panel.js";
import { uiReducer, initialUIState } from "./state.js";

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

  // Gate verdicts for header chain (M3)
  const gateVerdicts = artifacts.filter((a) => a.type === "gate_verdict");

  // Approval queue data
  const allPendingApprovals = store.listPendingApprovals();
  const approvalQueueItems: ApprovalQueueItem[] = allPendingApprovals.map((a) => ({
    approval: a,
    run: store.getWorkflowRun(a.workflowRunId),
  }));
  const blockedRuns = runs.filter((r) => r.status === "failed" || r.status === "escalated");

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
    if (ui.screen === "approvals") {
      const totalItems = approvalQueueItems.length + blockedRuns.length;
      if (totalItems === 0) return;
      if (direction === "up") {
        dispatch({ type: "SET_APPROVAL_INDEX", index: Math.max(0, ui.approvalIndex - 1) });
      } else if (direction === "down") {
        dispatch({ type: "SET_APPROVAL_INDEX", index: Math.min(totalItems - 1, ui.approvalIndex + 1) });
      }
      return;
    }

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
  }, [ui.screen, ui.focusedColumnIndex, ui.focusedRowIndex, ui.approvalIndex, getColumnRuns, approvalQueueItems.length, blockedRuns.length]);

  const handleSelect = useCallback(() => {
    if (ui.screen === "dashboard") {
      const colRuns = getColumnRuns(ui.focusedColumnIndex);
      const run = colRuns[ui.focusedRowIndex];
      if (run) {
        dispatch({ type: "OPEN_RUN", runId: run.id });
      }
    } else if (ui.screen === "approvals") {
      // Open the run for the selected approval
      if (ui.approvalIndex < approvalQueueItems.length) {
        const item = approvalQueueItems[ui.approvalIndex];
        if (item.run) {
          dispatch({ type: "OPEN_RUN", runId: item.run.id });
        }
      } else {
        const blockedIdx = ui.approvalIndex - approvalQueueItems.length;
        const run = blockedRuns[blockedIdx];
        if (run) {
          dispatch({ type: "OPEN_RUN", runId: run.id });
        }
      }
    }
  }, [ui.screen, ui.focusedColumnIndex, ui.focusedRowIndex, ui.approvalIndex, getColumnRuns, approvalQueueItems, blockedRuns]);

  // ─── Run actions ─────────────────────────────────────────────

  const getApprovalTarget = useCallback((): { issueNumber: number; runId: string } | null => {
    // In approvals screen, use the selected approval's run
    if (ui.screen === "approvals" && ui.approvalIndex < approvalQueueItems.length) {
      const item = approvalQueueItems[ui.approvalIndex];
      if (item.run) return { issueNumber: item.run.issueNumber, runId: item.run.id };
    }
    // Otherwise use selected run
    if (selectedRun) return { issueNumber: selectedRun.issueNumber, runId: selectedRun.id };
    return null;
  }, [ui.screen, ui.approvalIndex, approvalQueueItems, selectedRun]);

  const handleApprove = useCallback(() => {
    const target = getApprovalTarget();
    if (!target) return;

    const targetRun = store.getWorkflowRun(target.runId);
    if (!targetRun) return;
    if (targetRun.status !== "plan_draft" && targetRun.status !== "plan_revision") {
      showStatus("Can only approve plans in plan_draft/plan_revision status");
      return;
    }

    orchestrator.approvePlan(target.issueNumber).then(
      () => showStatus(`Plan approved for #${target.issueNumber}`),
      (err: unknown) => showStatus(`Approve failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, [getApprovalTarget, store, orchestrator, showStatus]);

  const handleRework = useCallback(() => {
    const target = getApprovalTarget();
    if (!target) return;

    const targetRun = store.getWorkflowRun(target.runId);
    if (!targetRun || targetRun.status !== "plan_draft") {
      showStatus("Rework only works on plan_draft status");
      return;
    }

    // Open rework dialog for feedback
    dispatch({ type: "SELECT_RUN", runId: target.runId });
    dispatch({ type: "OPEN_DIALOG", dialog: "rework" });
  }, [getApprovalTarget, store, showStatus]);

  const handleReworkSubmit = useCallback(() => {
    if (!selectedRun) return;
    const note = ui.reworkNote.trim() || undefined;
    dispatch({ type: "CLOSE_DIALOG" });

    orchestrator.reworkPlan(selectedRun.issueNumber, note).then(
      () => showStatus(`Plan sent for rework #${selectedRun.issueNumber}`),
      (err: unknown) => showStatus(`Rework failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, [selectedRun, ui.reworkNote, orchestrator, showStatus]);

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

    const phaseRetry: Record<string, { label: string; fn: () => Promise<unknown> }> = {
      triage: {
        label: "Retrying triage",
        fn: () => {
          store.deleteWorkflowRun(selectedRun.id);
          return orchestrator.triage(issue);
        },
      },
      plan: {
        label: "Retrying plan",
        fn: () => {
          store.updateStatus(selectedRun.id, "triaged", "Reset for retry");
          return orchestrator.plan(issue);
        },
      },
      implement: {
        label: "Retrying implement",
        fn: () => {
          store.updateStatus(selectedRun.id, "plan_accepted", "Reset for retry");
          return orchestrator.implementAndPR(issue);
        },
      },
      verify: {
        label: "Retrying verify",
        fn: () => {
          store.updateStatus(selectedRun.id, "implementing", "Reset for retry");
          return orchestrator.verify(issue);
        },
      },
      review: {
        label: "Retrying review",
        fn: () => {
          store.updateStatus(selectedRun.id, "draft_pr_opened", "Reset for retry");
          return orchestrator.review(issue);
        },
      },
      repair: {
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
    dispatch({ type: "OPEN_DIALOG", dialog: "new-run" });
  }, []);

  const handleNewRunSubmit = useCallback(() => {
    const sourceId = parseInt(ui.newRunForm.sourceId.trim(), 10);
    if (!sourceId || isNaN(sourceId)) {
      showStatus("Invalid number");
      return;
    }
    dispatch({ type: "CLOSE_DIALOG" });
    // TODO: support PR source type and watch mode in orchestrator
    showStatus(`Triaging #${sourceId}...`);
    orchestrator.triage(sourceId).then(
      (run) => {
        dispatch({ type: "OPEN_RUN", runId: run.id });
        showStatus(`#${sourceId}: ${run.status} -- press C to continue`);
      },
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        showStatus(`Failed: ${msg}`);
      },
    );
  }, [ui.newRunForm, orchestrator, showStatus]);

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

  const isDialogOpen = ui.dialog !== null;

  useKeybindings({
    onNavigate: handleNavigate,
    onSelect: isDialogOpen ? () => {} : handleSelect,
    onNextPane: () => dispatch({ type: "NEXT_PANE" }),
    onPrevPane: () => dispatch({ type: "PREV_PANE" }),
    onSetLogMode: (mode) => dispatch({ type: "SET_LOG_MODE", mode }),
    onApprove: isDialogOpen ? () => {} : handleApprove,
    onContinue: isDialogOpen ? () => {} : handleContinue,
    onRetry: isDialogOpen ? () => {} : handleRetry,
    onKill: isDialogOpen ? () => {} : handleKill,
    onDelete: isDialogOpen ? () => {} : handleDelete,
    onNewRun: isDialogOpen ? () => {} : handleNewRun,
    onQuit: () => exit(),
    onEnterInput: () => dispatch({ type: "SET_INPUT_MODE", active: true }),
    onExitInput: () => dispatch({ type: "SET_INPUT_MODE", active: false }),
    onBack: () => dispatch({ type: "BACK" }),
    onRework: isDialogOpen ? () => {} : handleRework,
    onOpenExternal: handleOpenExternal,
    onApprovalsView: handleApprovalsView,
    onToggleDiff: () => dispatch({ type: "TOGGLE_ARTIFACT_DIFF" }),
  }, ui.screen, ui.inputMode || isDialogOpen);

  // ─── Render ──────────────────────────────────────────────────

  const paneHeight = Math.max(8, Math.floor((termHeight - 10) / 2));

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* ── Run Focus screen ──────────────────────────────── */}
      {ui.screen === "run" && selectedRun ? (
        <>
          <Box borderStyle="single" borderColor="blue" flexShrink={0}>
            <RunHeader
              run={selectedRun}
              isActive={!!activeProcessId}
              gateVerdicts={gateVerdicts}
            />
          </Box>

          {/* Why paused panel — only for blocked states */}
          <WhyPausedPanel
            run={selectedRun}
            artifacts={artifacts}
            transitions={transitions}
          />

          <Box flexGrow={1} flexDirection="row" overflow="hidden">
            {/* Left: Artifact pane */}
            <Box flexGrow={1} flexBasis={0} flexDirection="column">
              <ArtifactPane
                artifacts={artifacts}
                approvals={approvals}
                isFocused={ui.focusedPane === "artifact"}
                height={paneHeight * 2}
                showDiff={ui.showArtifactDiff}
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
        /* ── Approvals screen ─────────────────────────────── */
        <ApprovalQueueView
          items={approvalQueueItems}
          blockedRuns={blockedRuns}
          selectedIndex={ui.approvalIndex}
          height={termHeight - 4}
        />
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

      {/* ── Dialogs ───────────────────────────────────────── */}
      {ui.dialog === "new-run" && (
        <Box position="absolute" marginTop={5} marginLeft={Math.floor((termWidth - 52) / 2)}>
          <NewRunDialog
            form={ui.newRunForm}
            onChangeSourceType={(t) => dispatch({ type: "SET_NEW_RUN_SOURCE_TYPE", sourceType: t })}
            onChangeSourceId={(v) => dispatch({ type: "SET_NEW_RUN_SOURCE_ID", value: v })}
            onChangeMode={(m) => dispatch({ type: "SET_NEW_RUN_MODE", mode: m })}
            onSubmit={handleNewRunSubmit}
            onCancel={() => dispatch({ type: "CLOSE_DIALOG" })}
          />
        </Box>
      )}

      {ui.dialog === "rework" && selectedRun && (
        <Box position="absolute" marginTop={5} marginLeft={Math.floor((termWidth - 62) / 2)}>
          <ReworkDialog
            issueNumber={selectedRun.issueNumber}
            note={ui.reworkNote}
            onChangeNote={(v) => dispatch({ type: "SET_REWORK_NOTE", value: v })}
            onSubmit={handleReworkSubmit}
            onCancel={() => dispatch({ type: "CLOSE_DIALOG" })}
          />
        </Box>
      )}

      {/* ── Input bar ─────────────────────────────────────── */}
      <InputBar
        isActive={ui.inputMode && !isDialogOpen}
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
        dialog={ui.dialog}
        inputMode={ui.inputMode}
        runStatus={selectedRun?.status}
        hasActiveProcess={!!activeProcessId}
      />
    </Box>
  );
}
