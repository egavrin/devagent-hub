import React, { useReducer, useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import type { StateStore } from "../state/store.js";
import type { ProcessRegistry } from "../runner/process-registry.js";
import type { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import type { WorkflowConfig } from "../workflow/config.js";
import type { GitHubGateway } from "../github/gateway.js";
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
import { AutopilotBar } from "./components/autopilot-bar.js";
import { RunnersView } from "./components/runners-view.js";
import { AutopilotView } from "./components/autopilot-view.js";
import { RerunDialog } from "./components/rerun-dialog.js";
import { SettingsView } from "./components/settings-view.js";
import { CommandPalette } from "./components/command-palette.js";
import type { PaletteCommand } from "./components/command-palette.js";
import { HelpDialog } from "./components/help-dialog.js";
import { uiReducer, initialUIState } from "./state.js";
import type { FocusPane, LogMode } from "./state.js";

interface AppProps {
  store: StateStore;
  registry: ProcessRegistry;
  orchestrator: WorkflowOrchestrator;
  config?: WorkflowConfig;
  github?: GitHubGateway;
  repo?: string;
}

export function App({ store, registry, orchestrator, config, github, repo }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 40;
  const termWidth = stdout?.columns ?? 120;
  const runs = useWorkflowRuns(store);

  const [ui, dispatch] = useReducer(uiReducer, initialUIState);

  // Filter runs when filter is active
  const filteredRuns = React.useMemo(() => {
    if (!ui.filterActive || !ui.filterQuery.trim()) return runs;
    const q = ui.filterQuery.toLowerCase();
    return runs.filter((r) => {
      const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
      return (
        String(r.issueNumber).includes(q) ||
        title.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.repo.toLowerCase().includes(q)
      );
    });
  }, [runs, ui.filterActive, ui.filterQuery]);

  // Autopilot state
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [autopilotStats, setAutopilotStats] = useState({ lastPoll: null as string | null, activeCount: 0, totalDispatched: 0 });
  const autopilotAbort = useRef<AbortController | null>(null);

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
    return filteredRuns.filter((r) => col.statuses.includes(r.status));
  }, [filteredRuns]);

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

  const handleEscalate = useCallback(() => {
    if (!selectedRun) return;
    const terminal = ["done", "failed", "escalated"];
    if (terminal.includes(selectedRun.status)) {
      showStatus("Cannot escalate a terminal run");
      return;
    }
    store.updateStatus(selectedRun.id, "escalated", "Escalated by user via TUI");
    showStatus(`Escalated #${selectedRun.issueNumber}`);
  }, [selectedRun, store, showStatus]);

  const handleRerunWithProfile = useCallback(() => {
    if (!selectedRun) return;
    if (!config || Object.keys(config.profiles).length === 0) {
      showStatus("No profiles configured");
      return;
    }
    dispatch({ type: "OPEN_DIALOG", dialog: "rerun" });
  }, [selectedRun, config, showStatus]);

  const handleRerunSubmit = useCallback((profileName: string) => {
    if (!selectedRun) return;
    dispatch({ type: "CLOSE_DIALOG" });

    // Kill current process if any
    if (activeProcessId) {
      const mp = registry.get(activeProcessId);
      if (mp) mp.kill();
    }

    // Update run's agent profile
    store.updateWorkflowRun(selectedRun.id, { agentProfile: profileName });

    // Retry the current phase
    const issue = selectedRun.issueNumber;
    const phase = selectedRun.currentPhase ?? "triage";

    const phaseRetry: Record<string, { label: string; fn: () => Promise<unknown> }> = {
      triage: {
        label: "Rerunning triage",
        fn: () => {
          store.deleteWorkflowRun(selectedRun.id);
          return orchestrator.triage(issue);
        },
      },
      plan: {
        label: "Rerunning plan",
        fn: () => {
          store.updateStatus(selectedRun.id, "triaged", "Rerun with profile");
          return orchestrator.plan(issue);
        },
      },
      implement: {
        label: "Rerunning implement",
        fn: () => {
          store.updateStatus(selectedRun.id, "plan_accepted", "Rerun with profile");
          return orchestrator.implementAndPR(issue);
        },
      },
      verify: {
        label: "Rerunning verify",
        fn: () => {
          store.updateStatus(selectedRun.id, "implementing", "Rerun with profile");
          return orchestrator.verify(issue);
        },
      },
      review: {
        label: "Rerunning review",
        fn: () => {
          store.updateStatus(selectedRun.id, "draft_pr_opened", "Rerun with profile");
          return orchestrator.review(issue);
        },
      },
      repair: {
        label: "Rerunning repair",
        fn: () => {
          store.updateStatus(selectedRun.id, "auto_review_fix_loop", "Rerun with profile");
          return orchestrator.repair(issue);
        },
      },
    };

    const retry = phaseRetry[phase] ?? phaseRetry["triage"];
    showStatus(`${retry.label} #${issue} with profile "${profileName}"...`, true);
    retry.fn().then(
      () => showStatus(`${retry.label} complete for #${issue}`),
      (err: unknown) => showStatus(`Rerun failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, [selectedRun, activeProcessId, registry, store, orchestrator, showStatus]);

  const handleNewRun = useCallback(() => {
    dispatch({ type: "OPEN_DIALOG", dialog: "new-run" });
  }, []);

  const handleNewRunSubmit = useCallback(() => {
    const sourceId = parseInt(ui.newRunForm.sourceId.trim(), 10);
    if (!sourceId || isNaN(sourceId)) {
      showStatus("Invalid number");
      return;
    }
    const { sourceType, mode } = ui.newRunForm;
    dispatch({ type: "CLOSE_DIALOG" });

    const label = mode === "watch" ? "Running (watch)" : "Triaging";
    showStatus(`${label} ${sourceType} #${sourceId}...`);

    const runFn = mode === "watch"
      ? orchestrator.runWorkflow(sourceId)
      : sourceType === "pr"
        ? orchestrator.triageFromPR(sourceId)
        : orchestrator.triage(sourceId);

    runFn.then(
      (run) => {
        // Store source type on the run
        store.updateWorkflowRun(run.id, {
          metadata: { ...(run.metadata as Record<string, unknown>), sourceType },
        });
        dispatch({ type: "OPEN_RUN", runId: run.id });
        const hint = mode === "watch" ? "" : " -- press C to continue";
        showStatus(`#${sourceId}: ${run.status}${hint}`);
      },
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        showStatus(`Failed: ${msg}`);
      },
    );
  }, [ui.newRunForm, orchestrator, store, showStatus]);

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

  const handlePause = useCallback(() => {
    if (!selectedRun) return;
    orchestrator.requestPause(selectedRun.id);
    showStatus(`Pause requested for #${selectedRun.issueNumber} — will pause after current phase`);
  }, [selectedRun, orchestrator, showStatus]);

  const handleTakeOver = useCallback(() => {
    if (!selectedRun) return;
    const worktree = (selectedRun.metadata as Record<string, unknown>)?.worktree as string | undefined;
    if (worktree) {
      showStatus(`Worktree: ${worktree}`);
    } else {
      showStatus(`No worktree path for #${selectedRun.issueNumber}`);
    }
  }, [selectedRun, showStatus]);

  const handleToggleAutopilot = useCallback(async () => {
    if (autopilotRunning) {
      autopilotAbort.current?.abort();
      setAutopilotRunning(false);
      showStatus("Autopilot stopping...");
      return;
    }

    if (!config || !github || !repo) {
      showStatus("Autopilot requires config, github, and repo");
      return;
    }

    const controller = new AbortController();
    autopilotAbort.current = controller;
    setAutopilotRunning(true);
    showStatus("Autopilot started");

    try {
      const { AutopilotDaemon } = await import("../workflow/autopilot.js");
      const daemon = new AutopilotDaemon({
        store, github, orchestrator, config, repo,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "poll_start") {
            setAutopilotStats((s) => ({ ...s, lastPoll: new Date().toISOString() }));
          } else if (event.type === "poll_done") {
            setAutopilotStats((s) => ({
              ...s,
              activeCount: s.activeCount + event.dispatched,
              totalDispatched: s.totalDispatched + event.dispatched,
            }));
          } else if (event.type === "complete" || event.type === "error") {
            setAutopilotStats((s) => ({ ...s, activeCount: Math.max(0, s.activeCount - 1) }));
          } else if (event.type === "stopped") {
            setAutopilotRunning(false);
            showStatus("Autopilot stopped");
          }
        },
      });
      await daemon.run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus(`Autopilot error: ${msg}`);
      setAutopilotRunning(false);
    }
  }, [autopilotRunning, config, github, repo, store, orchestrator, showStatus]);

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
    onPause: isDialogOpen ? () => {} : handlePause,
    onTakeOver: isDialogOpen ? () => {} : handleTakeOver,
    onToggleAutopilot: isDialogOpen ? () => {} : handleToggleAutopilot,
    onRunnersView: () => dispatch({ type: "SET_SCREEN", screen: "runners" }),
    onAutopilotView: () => dispatch({ type: "SET_SCREEN", screen: "autopilot" }),
    onFilter: isDialogOpen ? () => {} : () => dispatch({ type: "TOGGLE_FILTER" }),
    onCommandPalette: isDialogOpen ? () => {} : () => dispatch({ type: "OPEN_DIALOG", dialog: "command-palette" }),
    onHelp: isDialogOpen ? () => {} : () => dispatch({ type: "OPEN_DIALOG", dialog: "help" }),
    onEscalate: isDialogOpen ? () => {} : handleEscalate,
    onSettingsView: isDialogOpen ? () => {} : () => dispatch({ type: "SET_SCREEN", screen: "settings" }),
    onRerunWithProfile: isDialogOpen ? () => {} : handleRerunWithProfile,
    onPaneShortcut: (index: number) => {
      const paneMap: [FocusPane, LogMode | null][] = [
        ["queue", null],
        ["artifact", null],
        ["timeline", null],
        ["logs", "structured"],
        ["logs", "raw"],
      ];
      const entry = paneMap[index];
      if (!entry) return;
      dispatch({ type: "SET_FOCUSED_PANE", pane: entry[0] });
      if (entry[1]) {
        dispatch({ type: "SET_LOG_MODE", mode: entry[1] });
      }
    },
    onGoTop: () => {
      if (ui.screen === "dashboard") {
        dispatch({ type: "SET_FOCUSED_ROW", index: 0 });
        const colRuns = getColumnRuns(ui.focusedColumnIndex);
        if (colRuns[0]) {
          dispatch({ type: "SELECT_RUN", runId: colRuns[0].id });
        }
      } else if (ui.screen === "approvals") {
        dispatch({ type: "SET_APPROVAL_INDEX", index: 0 });
      }
    },
    onGoBottom: () => {
      if (ui.screen === "dashboard") {
        const colRuns = getColumnRuns(ui.focusedColumnIndex);
        const lastIdx = Math.max(0, colRuns.length - 1);
        dispatch({ type: "SET_FOCUSED_ROW", index: lastIdx });
        if (colRuns[lastIdx]) {
          dispatch({ type: "SELECT_RUN", runId: colRuns[lastIdx].id });
        }
      } else if (ui.screen === "approvals") {
        const totalItems = approvalQueueItems.length + blockedRuns.length;
        dispatch({ type: "SET_APPROVAL_INDEX", index: Math.max(0, totalItems - 1) });
      }
    },
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
      ) : ui.screen === "runners" && config ? (
        /* ── Runners screen ──────────────────────────────── */
        <RunnersView config={config} height={termHeight - 4} />
      ) : ui.screen === "autopilot" ? (
        /* ── Autopilot screen ────────────────────────────── */
        <AutopilotView
          config={config}
          runs={runs}
          autopilotRunning={autopilotRunning}
          stats={autopilotStats}
          height={termHeight - 4}
        />
      ) : ui.screen === "settings" && config ? (
        /* ── Settings screen ─────────────────────────────── */
        <SettingsView config={config} height={termHeight - 4} />
      ) : (
        /* ── Dashboard screen ─────────────────────────────── */
        <>
          <AutopilotBar
            running={autopilotRunning}
            lastPoll={autopilotStats.lastPoll}
            activeCount={autopilotStats.activeCount}
            totalDispatched={autopilotStats.totalDispatched}
          />
          {ui.filterActive && (
            <Box paddingLeft={1} flexShrink={0}>
              <Text color="cyan">Filter: </Text>
              <TextInput
                value={ui.filterQuery}
                onChange={(v: string) => dispatch({ type: "SET_FILTER", query: v })}
                onSubmit={() => {}}
              />
              <Text dimColor>  [/ to close, type to filter]</Text>
            </Box>
          )}
          <KanbanBoard
            runs={filteredRuns}
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

      {ui.dialog === "command-palette" && (
        <Box position="absolute" marginTop={5} marginLeft={Math.floor((termWidth - 52) / 2)}>
          <CommandPalette
            onSubmit={(command) => {
              dispatch({ type: "CLOSE_DIALOG" });
              switch (command) {
                case "approve": handleApprove(); break;
                case "rework": handleRework(); break;
                case "retry": handleRetry(); break;
                case "kill": handleKill(); break;
                case "pause": handlePause(); break;
                case "continue": handleContinue(); break;
                case "filter": dispatch({ type: "TOGGLE_FILTER" }); break;
                case "help": dispatch({ type: "OPEN_DIALOG", dialog: "help" }); break;
              }
            }}
            onCancel={() => dispatch({ type: "CLOSE_DIALOG" })}
          />
        </Box>
      )}

      {ui.dialog === "help" && (
        <Box position="absolute" marginTop={2} marginLeft={Math.floor((termWidth - 62) / 2)}>
          <HelpDialog onClose={() => dispatch({ type: "CLOSE_DIALOG" })} />
        </Box>
      )}

      {ui.dialog === "rerun" && config && (
        <Box position="absolute" marginTop={5} marginLeft={Math.floor((termWidth - 52) / 2)}>
          <RerunDialog
            profiles={Object.keys(config.profiles)}
            selectedIndex={ui.rerunProfileIndex}
            onSelect={handleRerunSubmit}
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
        autopilotRunning={autopilotRunning}
      />
    </Box>
  );
}
