import React, { useState, useCallback } from "react";
import { Box, useApp, useStdout } from "ink";
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
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [focusedColumnIndex, setFocusedColumnIndex] = useState(0);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [events] = useState<AgentEvent[]>([]);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;

  // Load detail data for selected run
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
    if (focusPane === "detail") {
      setFocusPane("kanban");
    } else if (focusPane === "logs") {
      setFocusPane("detail");
    }
  }, [focusPane]);

  const handleApprove = useCallback(async () => {
    if (!selectedRun) return;
    if (selectedRun.status === "plan_draft" || selectedRun.status === "plan_revision") {
      await orchestrator.approvePlan(selectedRun.issueNumber);
    }
  }, [selectedRun, orchestrator]);

  const handleRetry = useCallback(async () => {
    if (!selectedRun) return;
    if (selectedRun.status === "failed") {
      await orchestrator.triage(selectedRun.issueNumber);
    }
  }, [selectedRun, orchestrator]);

  const handleKill = useCallback(() => {
    if (!activeAgentId) return;
    const mp = registry.get(activeAgentId);
    if (mp) {
      mp.kill();
      if (selectedRun) {
        store.updateStatus(selectedRun.id, "failed", "Killed by user via TUI");
      }
    }
  }, [activeAgentId, registry, selectedRun, store]);

  const handleDelete = useCallback(() => {
    if (!selectedRun) return;
    store.deleteWorkflowRun(selectedRun.id);
    setSelectedRunId(null);
    setFocusPane("kanban");
  }, [selectedRun, store]);

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
    onNewRun: () => {},
    onQuit: () => exit(),
    onEnterInput: () => setInputMode(true),
    onExitInput: () => setInputMode(false),
    onBack: handleBack,
  }, focusPane, inputMode);

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
      <InputBar
        isActive={inputMode}
        onSubmit={handleSendInput}
      />
      <StatusBar inputMode={inputMode} focusPane={focusPane} />
    </Box>
  );
}
