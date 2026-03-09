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
import { KanbanBoard, KANBAN_COLUMNS, OPERATOR_BUCKETS } from "./components/kanban-board.js";
import { InputBar } from "./components/input-bar.js";
import { ArtifactPane } from "./components/artifact-pane.js";
import { TimelinePane } from "./components/timeline-pane.js";
import { LogPane } from "./components/log-pane.js";
import { ContextFooter } from "./components/context-footer.js";
import { NewRunDialog } from "./components/new-run-dialog.js";
import { ReworkDialog } from "./components/rework-dialog.js";
import { ApprovalQueueView, resolveInboxItem } from "./components/approval-queue-view.js";
import type { ApprovalQueueItem } from "./components/approval-queue-view.js";
import { AutopilotBar } from "./components/autopilot-bar.js";
import { RunnersView } from "./components/runners-view.js";
import type { RunnerInfo } from "./components/runners-view.js";
import { AutopilotView } from "./components/autopilot-view.js";
import { RerunDialog } from "./components/rerun-dialog.js";
import { SettingsView } from "./components/settings-view.js";
import { CommandPalette } from "./components/command-palette.js";
import { HelpDialog } from "./components/help-dialog.js";
import { SummaryBar } from "./components/summary-bar.js";
import { DetailTabBar } from "./components/detail-tab-bar.js";
import { SummaryTab } from "./components/summary-tab.js";
import { toOperatorStatus } from "./status-map.js";
import { uiReducer, initialUIState } from "./state.js";
import type { FocusPane, LogMode, GateStrictness, RunPriority, DetailTab } from "./state.js";

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

  // Runner discovery state
  const [runnerInfos, setRunnerInfos] = useState<RunnerInfo[]>([]);
  const [runnerBins, setRunnerBins] = useState<string[]>([]);

  useEffect(() => {
    if (!config) return;
    // Discover runners from config profiles
    const bins = new Set<string>();
    for (const profile of Object.values(config.profiles)) {
      bins.add(profile.bin ?? config.runner.bin ?? "devagent");
    }
    bins.add(config.runner.bin ?? "devagent");
    setRunnerBins([...bins]);

    // Async runner capability discovery
    import("../runner/launcher.js").then(({ describeRunner }) => {
      const infos: RunnerInfo[] = [];
      for (const bin of bins) {
        try {
          const desc = describeRunner(bin);
          infos.push({
            bin,
            version: desc?.version ?? null,
            supportedPhases: desc?.supportedPhases ?? [],
            availableProviders: desc?.availableProviders ?? [],
            supportedApprovalModes: desc?.supportedApprovalModes ?? [],
            mcpServers: desc?.mcpServers ?? [],
            tools: desc?.tools ?? [],
            healthy: desc !== null,
          });
        } catch {
          infos.push({ bin, version: null, supportedPhases: [], availableProviders: [], supportedApprovalModes: [], mcpServers: [], tools: [], healthy: false });
        }
      }
      setRunnerInfos(infos);
    }).catch(() => {});
  }, [config]);

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

  // Approval queue data
  const allPendingApprovals = store.listPendingApprovals();
  const approvalQueueItems: ApprovalQueueItem[] = allPendingApprovals.map((a) => ({
    approval: a,
    run: store.getWorkflowRun(a.workflowRunId),
  }));
  const escalatedRuns = runs.filter((r) => r.status === "escalated");
  const failedRuns = runs.filter((r) => r.status === "failed");
  const awaitingReviewRuns = runs.filter((r) => r.status === "awaiting_human_review");
  const readyToMergeRuns = runs.filter((r) => r.status === "ready_to_merge");
  const planRevisionRuns = runs.filter((r) => r.status === "plan_revision");

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

  // Visible (non-empty) operator buckets for navigation
  const visibleBuckets = React.useMemo(() => {
    return OPERATOR_BUCKETS
      .map((bucket, _i) => ({
        bucket,
        runs: filteredRuns.filter(bucket.match),
      }))
      .filter((b) => b.runs.length > 0);
  }, [filteredRuns]);

  const getColumnRuns = useCallback((colIndex: number) => {
    const visible = visibleBuckets[colIndex];
    if (!visible) return [];
    return visible.runs;
  }, [visibleBuckets]);

  const handleNavigate = useCallback((direction: "up" | "down" | "left" | "right") => {
    if (ui.screen === "approvals") {
      const totalItems = approvalQueueItems.length + planRevisionRuns.length + awaitingReviewRuns.length + readyToMergeRuns.length + escalatedRuns.length + failedRuns.length;
      if (totalItems === 0) return;
      let newIndex = ui.approvalIndex;
      if (direction === "up") {
        newIndex = Math.max(0, ui.approvalIndex - 1);
      } else if (direction === "down") {
        newIndex = Math.min(totalItems - 1, ui.approvalIndex + 1);
      }
      dispatch({ type: "SET_APPROVAL_INDEX", index: newIndex });
      // Sync selectedRunId so action handlers target the right run
      const item = resolveInboxItem(approvalQueueItems, planRevisionRuns, awaitingReviewRuns, readyToMergeRuns, escalatedRuns, failedRuns, newIndex);
      if (item?.run) {
        dispatch({ type: "SELECT_RUN", runId: item.run.id });
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
      newCol = Math.min(Math.max(0, visibleBuckets.length - 1), ui.focusedColumnIndex + 1);
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
  }, [ui.screen, ui.focusedColumnIndex, ui.focusedRowIndex, ui.approvalIndex, getColumnRuns, approvalQueueItems, awaitingReviewRuns, readyToMergeRuns, escalatedRuns, failedRuns]);

  const handleSelect = useCallback(() => {
    if (ui.screen === "dashboard") {
      const colRuns = getColumnRuns(ui.focusedColumnIndex);
      const run = colRuns[ui.focusedRowIndex];
      if (run) {
        dispatch({ type: "OPEN_RUN", runId: run.id });
      }
    } else if (ui.screen === "approvals") {
      const item = resolveInboxItem(approvalQueueItems, planRevisionRuns, awaitingReviewRuns, readyToMergeRuns, escalatedRuns, failedRuns, ui.approvalIndex);
      if (item?.run) {
        dispatch({ type: "OPEN_RUN", runId: item.run.id });
      }
    }
  }, [ui.screen, ui.focusedColumnIndex, ui.focusedRowIndex, ui.approvalIndex, getColumnRuns, approvalQueueItems, awaitingReviewRuns, readyToMergeRuns, escalatedRuns, failedRuns]);

  // ─── Run actions ─────────────────────────────────────────────

  const getApprovalTarget = useCallback((): { issueNumber: number; runId: string } | null => {
    // In approvals screen, resolve the focused item from any section
    if (ui.screen === "approvals") {
      const item = resolveInboxItem(approvalQueueItems, planRevisionRuns, awaitingReviewRuns, readyToMergeRuns, escalatedRuns, failedRuns, ui.approvalIndex);
      if (item?.run) return { issueNumber: item.run.issueNumber, runId: item.run.id };
    }
    // Otherwise use selected run
    if (selectedRun) return { issueNumber: selectedRun.issueNumber, runId: selectedRun.id };
    return null;
  }, [ui.screen, ui.approvalIndex, approvalQueueItems, awaitingReviewRuns, readyToMergeRuns, escalatedRuns, failedRuns, selectedRun]);

  const handleApprove = useCallback(() => {
    const target = getApprovalTarget();
    if (!target) return;

    const targetRun = store.getWorkflowRun(target.runId);
    if (!targetRun) return;

    if (targetRun.status === "plan_draft" || targetRun.status === "plan_revision") {
      orchestrator.approvePlan(target.issueNumber).then(
        () => showStatus(`Plan approved for #${target.issueNumber}`),
        (err: unknown) => showStatus(`Approve failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    } else if (targetRun.status === "awaiting_human_review") {
      store.updateStatus(targetRun.id, "ready_to_merge", "Human review approved via TUI");
      showStatus(`Review approved for #${target.issueNumber} — ready to merge`);
    } else if (targetRun.status === "ready_to_merge") {
      store.updateStatus(targetRun.id, "done", "Marked done via TUI");
      showStatus(`#${target.issueNumber} marked done`);
    } else {
      showStatus(`Cannot approve from "${targetRun.status}" status`);
    }
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
        label: "Marking reviewed",
        fn: async () => {
          store.updateStatus(selectedRun.id, "ready_to_merge", "Marked reviewed via TUI");
          return store.getWorkflowRun(selectedRun.id);
        },
      },
      ready_to_merge: {
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

  const handleRerunReviewer = useCallback(() => {
    if (!selectedRun) return;
    if (selectedRun.status !== "awaiting_human_review") {
      showStatus("Rerun reviewer only works on awaiting_human_review");
      return;
    }
    const issue = selectedRun.issueNumber;
    store.updateStatus(selectedRun.id, "draft_pr_opened", "Reviewer rerun requested");
    showStatus(`Rerunning reviewer for #${issue}...`, true);
    orchestrator.review(issue).then(
      () => showStatus(`Review rerun complete for #${issue}`),
      (err: unknown) => showStatus(`Reviewer rerun failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, [selectedRun, store, orchestrator, showStatus]);

  const handleRetry = useCallback(() => {
    if (!selectedRun) return;
    // Redirect to rerun reviewer if in awaiting_human_review
    if (selectedRun.status === "awaiting_human_review") {
      handleRerunReviewer();
      return;
    }
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
  }, [selectedRun, handleRerunReviewer, orchestrator, store, showStatus]);

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
    const { sourceType, mode, profile, runner, model, gateStrictness, priority } = ui.newRunForm;
    const rawSourceId = ui.newRunForm.sourceId.trim();

    if (sourceType === "project-brief") {
      // For project-brief, sourceId is a file path, not a number
      if (!rawSourceId) {
        showStatus("Brief path required");
        return;
      }
      dispatch({ type: "CLOSE_DIALOG" });
      showStatus(`Bootstrapping from brief: ${rawSourceId}...`);

      orchestrator.bootstrapFromBrief(rawSourceId).then(
        (run) => {
          const updates: Record<string, unknown> = {
            metadata: { ...(run.metadata as Record<string, unknown>), sourceType, gateStrictness, priority },
          };
          if (profile) (updates as any).agentProfile = profile;
          if (runner) (updates as any).runnerId = runner;
          if (model) (updates as any).requestedModel = model;
          store.updateWorkflowRun(run.id, updates as any);
          dispatch({ type: "OPEN_RUN", runId: run.id });
          showStatus(`Bootstrap complete: ${run.status} -- press C to continue`);
        },
        (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          showStatus(`Bootstrap failed: ${msg}`);
        },
      );
      return;
    }

    const sourceId = parseInt(rawSourceId, 10);
    if (!sourceId || isNaN(sourceId)) {
      showStatus("Invalid number");
      return;
    }
    dispatch({ type: "CLOSE_DIALOG" });

    const isAutoMode = mode === "watch" || mode === "autopilot-once";
    const label = mode === "watch" ? "Running (watch)" : mode === "autopilot-once" ? "Running (autopilot-once)" : "Triaging";
    showStatus(`${label} ${sourceType} #${sourceId}...`);

    const runFn = isAutoMode
      ? orchestrator.runWorkflow(sourceId)
      : sourceType === "pr"
        ? orchestrator.triageFromPR(sourceId)
        : orchestrator.triage(sourceId);

    runFn.then(
      (run) => {
        // Store source type, profile, and model overrides on the run
        const updates: Record<string, unknown> = {
          metadata: { ...(run.metadata as Record<string, unknown>), sourceType, gateStrictness, priority },
        };
        if (profile) (updates as any).agentProfile = profile;
        if (runner) (updates as any).runnerId = runner;
        if (model) (updates as any).requestedModel = model;
        store.updateWorkflowRun(run.id, updates as any);
        dispatch({ type: "OPEN_RUN", runId: run.id });
        const hint = isAutoMode ? "" : " -- press C to continue";
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

  // ─── Jump handlers ────────────────────────────────────────────

  const handleJumpArtifact = useCallback(() => {
    if (ui.screen !== "run") return;
    dispatch({ type: "JUMP_TO", target: "latest_artifact" });
  }, [ui.screen]);

  const handleJumpGate = useCallback(() => {
    if (ui.screen !== "run") return;
    dispatch({ type: "JUMP_TO", target: "latest_gate" });
  }, [ui.screen]);

  const handleJumpError = useCallback(() => {
    if (ui.screen !== "run") return;
    dispatch({ type: "JUMP_TO", target: "last_error" });
  }, [ui.screen]);

  const handleJumpToAgentRun = useCallback((agentRunId: string) => {
    dispatch({ type: "JUMP_TO_AGENT_RUN", agentRunId });
  }, []);

  // ─── Keybindings ─────────────────────────────────────────────

  const isDialogOpen = ui.dialog !== null;

  useKeybindings({
    onNavigate: handleNavigate,
    onSelect: isDialogOpen ? () => {} : handleSelect,
    onNextPane: () => dispatch({ type: "NEXT_PANE" }),
    onPrevPane: () => dispatch({ type: "PREV_PANE" }),
    onNextDetailTab: () => dispatch({ type: "NEXT_DETAIL_TAB" }),
    onPrevDetailTab: () => dispatch({ type: "PREV_DETAIL_TAB" }),
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
    onJumpArtifact: isDialogOpen ? () => {} : handleJumpArtifact,
    onJumpGate: isDialogOpen ? () => {} : handleJumpGate,
    onJumpError: isDialogOpen ? () => {} : handleJumpError,
    onDetailTabShortcut: (index: number) => {
      const tabs: DetailTab[] = ["summary", "timeline", "artifacts", "logs"];
      const tab = tabs[index];
      if (tab) {
        dispatch({ type: "SET_DETAIL_TAB", tab });
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
        const totalItems = approvalQueueItems.length + planRevisionRuns.length + awaitingReviewRuns.length + readyToMergeRuns.length + escalatedRuns.length + failedRuns.length;
        dispatch({ type: "SET_APPROVAL_INDEX", index: Math.max(0, totalItems - 1) });
      }
    },
  }, ui.screen, ui.inputMode || isDialogOpen);

  // ─── Render ──────────────────────────────────────────────────

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {/* ── Run Focus screen ──────────────────────────────── */}
      {ui.screen === "run" && selectedRun ? (
        <>
          {/* Tab bar */}
          <DetailTabBar
            activeTab={ui.detailTab}
            onSelect={(tab) => dispatch({ type: "SET_DETAIL_TAB", tab })}
          />

          {/* Tab content — fullscreen */}
          <Box flexGrow={1} flexDirection="column" overflow="hidden">
            {ui.detailTab === "summary" ? (
              <SummaryTab
                run={selectedRun}
                artifacts={artifacts}
                transitions={transitions}
                agentRuns={agentRuns}
                approvals={approvals}
                isActive={!!activeProcessId}
                height={termHeight - 6}
              />
            ) : ui.detailTab === "timeline" ? (
              <TimelinePane
                agentRuns={agentRuns}
                transitions={transitions}
                artifacts={artifacts}
                isFocused={true}
                height={termHeight - 6}
                jumpTarget={ui.jumpTarget}
                scrollToAgentRunId={ui.scrollToAgentRunId}
              />
            ) : ui.detailTab === "artifacts" ? (
              <ArtifactPane
                artifacts={artifacts}
                approvals={approvals}
                agentRuns={agentRuns}
                isFocused={true}
                height={termHeight - 6}
                showDiff={ui.showArtifactDiff}
                onJumpToAgentRun={handleJumpToAgentRun}
              />
            ) : (
              <LogPane
                selectedRun={selectedRun}
                logMode={ui.logMode}
                events={logEntries.map((e) => ({
                  timestamp: e.timestamp,
                  type: "output" as const,
                  summary: e.text,
                }))}
                outputLines={outputLines}
                isFocused={true}
              />
            )}
          </Box>
        </>
      ) : ui.screen === "approvals" ? (
        /* ── Approvals screen ─────────────────────────────── */
        <ApprovalQueueView
          items={approvalQueueItems}
          planRevisionRuns={planRevisionRuns}
          escalatedRuns={escalatedRuns}
          failedRuns={failedRuns}
          awaitingReviewRuns={awaitingReviewRuns}
          readyToMergeRuns={readyToMergeRuns}
          selectedIndex={ui.approvalIndex}
          height={termHeight - 4}
        />
      ) : ui.screen === "runners" && config ? (
        /* ── Runners screen ──────────────────────────────── */
        <RunnersView config={config} runs={runs} agentRuns={store.getRecentAgentRuns()} runnerInfos={runnerInfos} height={termHeight - 4} />
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
          {/* Summary bar — one thin line with counts */}
          <SummaryBar
            mode={runs.length > 0 ? runs[0].mode : null}
            runningCount={runs.filter(r => toOperatorStatus(r.status) === "Running").length}
            needsActionCount={runs.filter(r => toOperatorStatus(r.status) === "Needs Action").length}
            blockedCount={runs.filter(r => toOperatorStatus(r.status) === "Blocked").length}
            failedCount={runs.filter(r => r.status === "failed").length}
            doneCount={runs.filter(r => toOperatorStatus(r.status) === "Done").length}
            totalCount={runs.length}
            autopilotOn={autopilotRunning}
            activeRunners={registry.list().length}
          />
          <AutopilotBar
            running={autopilotRunning}
            lastPoll={autopilotStats.lastPoll}
            activeCount={autopilotStats.activeCount}
            totalDispatched={autopilotStats.totalDispatched}
            escalatedCount={runs.filter(r => r.status === "escalated").length}
            maxEscalations={config?.budget.max_unresolved_escalations}
            totalCostUsd={store.getRecentAgentRuns(1000).reduce((sum, ar) => sum + (ar.costUsd ?? 0), 0)}
            sessionMaxCostUsd={config?.budget.session_max_cost_usd}
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
            compactMode={true}
          />
        </>
      )}

      {/* ── Dialogs ───────────────────────────────────────── */}
      {ui.dialog === "new-run" && (
        <Box position="absolute" marginTop={5} marginLeft={Math.floor((termWidth - 52) / 2)}>
          <NewRunDialog
            form={ui.newRunForm}
            profiles={config ? Object.keys(config.profiles) : []}
            runners={runnerBins}
            onChangeSourceType={(t) => dispatch({ type: "SET_NEW_RUN_SOURCE_TYPE", sourceType: t })}
            onChangeSourceId={(v) => dispatch({ type: "SET_NEW_RUN_SOURCE_ID", value: v })}
            onChangeMode={(m) => dispatch({ type: "SET_NEW_RUN_MODE", mode: m })}
            onChangeProfile={(p) => dispatch({ type: "SET_NEW_RUN_PROFILE", profile: p })}
            onChangeRunner={(r) => dispatch({ type: "SET_NEW_RUN_RUNNER", runner: r })}
            onChangeModel={(m) => dispatch({ type: "SET_NEW_RUN_MODEL", model: m })}
            onChangeGateStrictness={(g) => dispatch({ type: "SET_NEW_RUN_GATE_STRICTNESS", gateStrictness: g })}
            onChangePriority={(p) => dispatch({ type: "SET_NEW_RUN_PRIORITY", priority: p })}
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
                case "rerun": handleRerunWithProfile(); break;
                case "kill": handleKill(); break;
                case "pause": handlePause(); break;
                case "continue": handleContinue(); break;
                case "escalate": handleEscalate(); break;
                case "delete": handleDelete(); break;
                case "take-over": handleTakeOver(); break;
                case "open-pr": handleOpenExternal(); break;
                case "filter": dispatch({ type: "TOGGLE_FILTER" }); break;
                case "approvals": dispatch({ type: "SET_SCREEN", screen: "approvals" }); break;
                case "runners": dispatch({ type: "SET_SCREEN", screen: "runners" }); break;
                case "autopilot": handleToggleAutopilot(); break;
                case "settings": dispatch({ type: "SET_SCREEN", screen: "settings" }); break;
                case "help": dispatch({ type: "OPEN_DIALOG", dialog: "help" }); break;
                case "errors": dispatch({ type: "SET_LOG_MODE", mode: "errors" }); break;
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
