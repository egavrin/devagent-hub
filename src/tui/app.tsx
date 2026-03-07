import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import type { StateStore } from "../state/store.js";
import type { ProcessRegistry } from "../runner/process-registry.js";
import type { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import type { WorkflowRun, AgentRun } from "../state/types.js";
import { useWorkflowRuns } from "./hooks/use-workflow-runs.js";
import { useEventLog, type LogEntry } from "./hooks/use-event-log.js";
import { useKeybindings } from "./hooks/use-keybindings.js";
import { KanbanBoard, KANBAN_COLUMNS } from "./components/kanban-board.js";
import { InputBar } from "./components/input-bar.js";
import { RunDetail } from "./components/run-detail.js";

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

  const [inputMode, setInputMode] = useState(false);
  const [newRunMode, setNewRunMode] = useState(false);
  const [newRunInput, setNewRunInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [focusedColumnIndex, setFocusedColumnIndex] = useState(0);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [showDetail, setShowDetail] = useState(false);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  const agentRuns: AgentRun[] = selectedRun
    ? store.getAgentRunsByWorkflow(selectedRun.id)
    : [];

  const artifacts = selectedRun
    ? store.getArtifactsByWorkflow(selectedRun.id)
    : [];

  const transitions = selectedRun
    ? store.getTransitions(selectedRun.id)
    : [];

  // Track active process for kill functionality
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);

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

  const activeAgentId = activeProcessId;

  // Derive events file path: <artifactsDir>/<agentRunId>/<phase>-events.jsonl
  const latestAgentRun = agentRuns.length > 0 ? agentRuns[agentRuns.length - 1] : null;
  const eventsPath = latestAgentRun
    ? latestAgentRun.eventsPath ?? `${require("os").homedir()}/.config/devagent-hub/artifacts/${latestAgentRun.id}/${latestAgentRun.phase}-events.jsonl`
    : null;
  const logEntries = useEventLog(eventsPath);

  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showStatus = useCallback((msg: string, persist = false) => {
    if (statusTimer.current) clearTimeout(statusTimer.current);
    setStatusMessage(msg);
    if (!persist) {
      statusTimer.current = setTimeout(() => setStatusMessage(null), 5000);
    }
  }, []);

  const getColumnRuns = useCallback((colIndex: number): WorkflowRun[] => {
    const col = KANBAN_COLUMNS[colIndex];
    if (!col) return [];
    return runs.filter((r) => col.statuses.includes(r.status));
  }, [runs]);

  const handleNavigate = useCallback((direction: "up" | "down" | "left" | "right") => {
    let newCol = focusedColumnIndex;
    let newRow = focusedRowIndex;

    if (direction === "left") {
      newCol = Math.max(0, focusedColumnIndex - 1);
      newRow = 0;
    } else if (direction === "right") {
      newCol = Math.min(KANBAN_COLUMNS.length - 1, focusedColumnIndex + 1);
      newRow = 0;
    } else if (direction === "up") {
      newRow = Math.max(0, focusedRowIndex - 1);
    } else {
      const colRuns = getColumnRuns(focusedColumnIndex);
      newRow = Math.min(Math.max(colRuns.length - 1, 0), focusedRowIndex + 1);
    }

    setFocusedColumnIndex(newCol);
    setFocusedRowIndex(newRow);

    const colRuns = getColumnRuns(newCol);
    if (colRuns[newRow]) {
      setSelectedRunId(colRuns[newRow].id);
    }
  }, [focusedColumnIndex, focusedRowIndex, getColumnRuns]);

  const handleSelect = useCallback(() => {
    const colRuns = getColumnRuns(focusedColumnIndex);
    if (colRuns[focusedRowIndex]) {
      const runId = colRuns[focusedRowIndex].id;
      if (selectedRunId === runId) {
        setShowDetail((d) => !d);
      } else {
        setSelectedRunId(runId);
        setShowDetail(true);
      }
    }
  }, [focusedColumnIndex, focusedRowIndex, getColumnRuns, selectedRunId]);

  const handleBack = useCallback(() => {
    if (newRunMode) {
      setNewRunMode(false);
      setNewRunInput("");
    } else if (showDetail) {
      setShowDetail(false);
    }
  }, [newRunMode, showDetail]);

  const handleApprove = useCallback(() => {
    if (!selectedRun) return;
    if (selectedRun.status === "plan_draft" || selectedRun.status === "plan_revision") {
      orchestrator.approvePlan(selectedRun.issueNumber).then(
        () => showStatus(`Plan approved for #${selectedRun.issueNumber}`),
        (err: unknown) => showStatus(`Approve failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    }
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
      showStatus(`Cannot continue from "${status}" — task may be running or terminal`);
      return;
    }

    showStatus(`${action.label} #${issue}...`, true);
    action.fn().then(
      () => showStatus(`${action.label} complete for #${issue} — press C to continue`),
      (err: unknown) => showStatus(`Failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, [selectedRun, orchestrator, store, showStatus]);

  const handleRetry = useCallback(() => {
    if (!selectedRun) return;
    if (selectedRun.status !== "failed") {
      showStatus("Retry only works on failed tasks");
      return;
    }

    const issue = selectedRun.issueNumber;
    const phase = selectedRun.currentPhase;

    // Reset to pre-phase status and re-run that phase
    const phaseRetry: Record<string, { resetTo: string; label: string; fn: () => Promise<unknown> }> = {
      triage: {
        resetTo: "new",
        label: "Retrying triage",
        fn: () => {
          // Triage creates its own workflow run, so delete the failed one and start fresh
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
      () => showStatus(`${retry.label} complete for #${issue} — press C to continue`),
      (err: unknown) => showStatus(`Retry failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }, [selectedRun, orchestrator, store, showStatus]);

  const handleKill = useCallback(() => {
    if (!activeAgentId) return;
    const mp = registry.get(activeAgentId);
    if (mp) {
      mp.kill();
      if (selectedRun) {
        store.updateStatus(selectedRun.id, "failed", "Killed by user via TUI");
        showStatus(`Killed agent for #${selectedRun.issueNumber}`);
      }
    }
  }, [activeAgentId, registry, selectedRun, store, showStatus]);

  const handleDelete = useCallback(() => {
    if (!selectedRun) return;
    const issueNum = selectedRun.issueNumber;
    store.deleteWorkflowRun(selectedRun.id);
    setSelectedRunId(null);
    showStatus(`Deleted run for #${issueNum}`);
  }, [selectedRun, store, showStatus]);

  const handleNewRun = useCallback(() => {
    setNewRunMode(true);
    setNewRunInput("");
  }, []);

  const handleNewRunSubmit = useCallback((text: string) => {
    const issueNumber = parseInt(text.trim(), 10);
    if (!issueNumber || isNaN(issueNumber)) {
      showStatus("Invalid issue number");
      setNewRunMode(false);
      setNewRunInput("");
      return;
    }
    setNewRunMode(false);
    setNewRunInput("");
    showStatus(`Triaging #${issueNumber}...`);
    orchestrator.triage(issueNumber).then(
      (run) => {
        setSelectedRunId(run.id);
        showStatus(`#${issueNumber}: ${run.status} — press C to continue`);
      },
      (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        showStatus(`Failed: ${msg}`);
      },
    );
  }, [orchestrator, showStatus]);

  const handleSendInput = useCallback((text: string) => {
    if (!activeAgentId) return;
    const mp = registry.get(activeAgentId);
    mp?.sendInput(text + "\n");
  }, [activeAgentId, registry]);

  useKeybindings({
    onNavigate: handleNavigate,
    onSelect: handleSelect,
    onSwitchPane: () => { if (selectedRun) setShowDetail((d) => !d); },
    onSetLogMode: () => {},
    onApprove: handleApprove,
    onContinue: handleContinue,
    onRetry: handleRetry,
    onKill: handleKill,
    onDelete: handleDelete,
    onNewRun: handleNewRun,
    onQuit: () => exit(),
    onEnterInput: () => setInputMode(true),
    onExitInput: () => setInputMode(false),
    onBack: handleBack,
  }, "kanban", inputMode || newRunMode);

  // One-line task info
  const taskInfo = selectedRun
    ? `#${selectedRun.issueNumber} ${(selectedRun.metadata as Record<string, unknown>)?.title ?? ""} [${selectedRun.status}]${selectedRun.currentPhase ? ` phase:${selectedRun.currentPhase}` : ""}${activeAgentId ? " ● RUNNING" : ""}`
    : "No task selected — press N to start a new run";

  // Log area: reserve space for kanban (~10 lines), task info (1), input/status/hints (3)
  const logHeight = Math.max(5, termHeight - 16);
  const visibleLogs = logEntries.slice(-logHeight);

  const hints = inputMode
    ? "Type message, Enter send, Esc cancel"
    : showDetail
    ? "Esc back  C continue  A approve  R retry  K kill  Tab toggle  Q quit"
    : "j/k↕ h/l↔  Enter detail  C continue  A approve  R retry  N new  D del  K kill  I input  Q quit";

  const detailHeight = Math.max(10, termHeight - 6);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      {showDetail && selectedRun ? (
        <Box borderStyle="single" borderColor="blue" flexDirection="column" flexGrow={1} overflow="hidden">
          <RunDetail
            run={selectedRun}
            agentRuns={agentRuns}
            artifacts={artifacts}
            transitions={transitions}
            height={detailHeight}
          />
        </Box>
      ) : (
        <>
          <KanbanBoard
            runs={runs}
            selectedRunId={selectedRunId}
            activeRunId={activeAgentId}
            focusedColumnIndex={focusedColumnIndex}
            isFocused={true}
          />
          <Box paddingLeft={1} flexShrink={0}>
            <Text bold color={activeAgentId ? "green" : "white"}>{taskInfo}</Text>
          </Box>
          <Box
            borderStyle="single"
            borderColor="gray"
            flexDirection="column"
            flexGrow={1}
            paddingLeft={1}
            overflow="hidden"
          >
            {visibleLogs.length === 0 ? (
              <Text dimColor>No logs yet — select a task and press C to continue</Text>
            ) : (
              visibleLogs.map((entry, i) => (
                <Text key={i} wrap="truncate">
                  <Text dimColor>{entry.timestamp.slice(11, 19)} </Text>
                  {entry.text}
                </Text>
              ))
            )}
          </Box>
        </>
      )}
      {newRunMode && (
        <Box paddingLeft={1} flexShrink={0}>
          <Text color="green">Issue #: </Text>
          <TextInput
            value={newRunInput}
            onChange={setNewRunInput}
            onSubmit={handleNewRunSubmit}
          />
          <Text dimColor>  Enter to start, Esc to cancel</Text>
        </Box>
      )}
      <InputBar
        isActive={inputMode && !newRunMode}
        onSubmit={handleSendInput}
      />
      {statusMessage && (
        <Box paddingLeft={1} flexShrink={0}>
          <Text color="yellow">{statusMessage}</Text>
        </Box>
      )}
      <Box paddingLeft={1} flexShrink={0}>
        <Text dimColor>{hints}</Text>
      </Box>
    </Box>
  );
}
