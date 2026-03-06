import React, { useState, useCallback } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import TextInput from "ink-text-input";
import type { StateStore } from "../state/store.js";
import type { ProcessRegistry } from "../runner/process-registry.js";
import type { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import type { WorkflowRun, AgentRun, StatusTransition } from "../state/types.js";
import type { AgentEvent } from "./event-parser.js";
import { useWorkflowRuns } from "./hooks/use-workflow-runs.js";
import { useProcessOutput } from "./hooks/use-process-output.js";
import { useKeybindings, type FocusPane, type LogMode } from "./hooks/use-keybindings.js";
import { KanbanBoard, KANBAN_COLUMNS } from "./components/kanban-board.js";
import { LogPane } from "./components/log-pane.js";
import { DetailPanel } from "./components/detail-panel.js";
import { InputBar } from "./components/input-bar.js";
import { StatusBar } from "./components/status-bar.js";

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

  const [focusPane, setFocusPane] = useState<FocusPane>("kanban");
  const [logMode, setLogMode] = useState<LogMode>("structured");
  const [inputMode, setInputMode] = useState(false);
  const [newRunMode, setNewRunMode] = useState(false);
  const [newRunInput, setNewRunInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [focusedColumnIndex, setFocusedColumnIndex] = useState(0);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [events] = useState<AgentEvent[]>([]);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  const transitions: StatusTransition[] = selectedRun
    ? store.getTransitions(selectedRun.id)
    : [];
  const agentRuns: AgentRun[] = selectedRun
    ? store.getAgentRunsByWorkflow(selectedRun.id)
    : [];

  const activeAgentId = selectedRun
    ? `${selectedRun.id}-${selectedRun.currentPhase ?? "triage"}`
    : null;

  const outputLines = useProcessOutput(registry, activeAgentId);

  const showStatus = useCallback((msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(null), 3000);
  }, []);

  const getColumnRuns = useCallback((colIndex: number): WorkflowRun[] => {
    const col = KANBAN_COLUMNS[colIndex];
    if (!col) return [];
    return runs.filter((r) => col.statuses.includes(r.status));
  }, [runs]);

  const handleNavigate = useCallback((direction: "up" | "down" | "left" | "right") => {
    if (focusPane !== "kanban") return;

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
  }, [focusPane, focusedColumnIndex, focusedRowIndex, getColumnRuns]);

  const handleSelect = useCallback(() => {
    if (focusPane === "kanban") {
      const colRuns = getColumnRuns(focusedColumnIndex);
      if (colRuns[focusedRowIndex]) {
        setSelectedRunId(colRuns[focusedRowIndex].id);
        setFocusPane("detail");
      }
    }
  }, [focusPane, focusedColumnIndex, focusedRowIndex, getColumnRuns]);

  const handleBack = useCallback(() => {
    if (newRunMode) {
      setNewRunMode(false);
      setNewRunInput("");
      return;
    }
    if (focusPane === "detail") {
      setFocusPane("kanban");
    } else if (focusPane === "logs") {
      setFocusPane("detail");
    }
  }, [focusPane, newRunMode]);

  const handleApprove = useCallback(async () => {
    if (!selectedRun) return;
    if (selectedRun.status === "plan_draft" || selectedRun.status === "plan_revision") {
      await orchestrator.approvePlan(selectedRun.issueNumber);
      showStatus(`Plan approved for #${selectedRun.issueNumber}`);
    }
  }, [selectedRun, orchestrator, showStatus]);

  const handleRetry = useCallback(async () => {
    if (!selectedRun) return;
    if (selectedRun.status === "failed") {
      showStatus(`Retrying #${selectedRun.issueNumber}...`);
      await orchestrator.triage(selectedRun.issueNumber);
    }
  }, [selectedRun, orchestrator, showStatus]);

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
    setFocusPane("kanban");
    showStatus(`Deleted run for #${issueNum}`);
  }, [selectedRun, store, showStatus]);

  const handleNewRun = useCallback(() => {
    setNewRunMode(true);
    setNewRunInput("");
  }, []);

  const handleNewRunSubmit = useCallback(async (text: string) => {
    const issueNumber = parseInt(text.trim(), 10);
    if (!issueNumber || isNaN(issueNumber)) {
      showStatus("Invalid issue number");
      setNewRunMode(false);
      setNewRunInput("");
      return;
    }
    setNewRunMode(false);
    setNewRunInput("");
    showStatus(`Starting workflow for #${issueNumber}...`);
    try {
      const run = await orchestrator.runWorkflow(issueNumber, { autoApprove: true });
      setSelectedRunId(run.id);
      showStatus(`Workflow for #${issueNumber}: ${run.status}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus(`Failed: ${msg}`);
    }
  }, [orchestrator, showStatus]);

  const handleSendInput = useCallback((text: string) => {
    if (!activeAgentId) return;
    const mp = registry.get(activeAgentId);
    mp?.sendInput(text + "\n");
  }, [activeAgentId, registry]);

  const handleSwitchPane = useCallback(() => {
    if (focusPane === "kanban") {
      if (selectedRun) {
        setFocusPane("detail");
      }
    } else if (focusPane === "detail") {
      setFocusPane("logs");
    } else {
      setFocusPane("kanban");
    }
  }, [focusPane, selectedRun]);

  useKeybindings({
    onNavigate: handleNavigate,
    onSelect: handleSelect,
    onSwitchPane: handleSwitchPane,
    onSetLogMode: setLogMode,
    onApprove: handleApprove,
    onRetry: handleRetry,
    onKill: handleKill,
    onDelete: handleDelete,
    onNewRun: handleNewRun,
    onQuit: () => exit(),
    onEnterInput: () => setInputMode(true),
    onExitInput: () => setInputMode(false),
    onBack: handleBack,
  }, focusPane, inputMode || newRunMode);

  const showDetail = focusPane === "detail" || focusPane === "logs";

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      <KanbanBoard
        runs={runs}
        selectedRunId={selectedRunId}
        activeRunId={activeAgentId}
        focusedColumnIndex={focusedColumnIndex}
        isFocused={focusPane === "kanban"}
      />
      {showDetail && selectedRun ? (
        <DetailPanel
          run={selectedRun}
          transitions={transitions}
          agentRuns={agentRuns}
          isFocused={focusPane === "detail"}
        />
      ) : (
        <LogPane
          selectedRun={selectedRun}
          logMode={logMode}
          events={events}
          outputLines={outputLines}
          isFocused={focusPane === "logs"}
        />
      )}
      {focusPane === "logs" && (
        <LogPane
          selectedRun={selectedRun}
          logMode={logMode}
          events={events}
          outputLines={outputLines}
          isFocused={true}
        />
      )}
      {newRunMode && (
        <Box paddingLeft={1}>
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
        <Box paddingLeft={1}>
          <Text color="yellow">{statusMessage}</Text>
        </Box>
      )}
      <StatusBar inputMode={inputMode} focusPane={focusPane} />
    </Box>
  );
}
