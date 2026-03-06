import React, { useState, useCallback } from "react";
import { Box, useApp, useStdout } from "ink";
import type { StateStore } from "../state/store.js";
import type { ProcessRegistry } from "../runner/process-registry.js";
import type { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import type { WorkflowRun } from "../state/types.js";
import type { AgentEvent } from "./event-parser.js";
import { useWorkflowRuns } from "./hooks/use-workflow-runs.js";
import { useProcessOutput } from "./hooks/use-process-output.js";
import { useKeybindings, type FocusPane, type LogMode } from "./hooks/use-keybindings.js";
import { KanbanBoard, KANBAN_COLUMNS } from "./components/kanban-board.js";
import { LogPane } from "./components/log-pane.js";
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
    const colRuns = getColumnRuns(focusedColumnIndex);
    if (colRuns[focusedRowIndex]) {
      setSelectedRunId(colRuns[focusedRowIndex].id);
      setFocusPane("logs");
    }
  }, [focusedColumnIndex, focusedRowIndex, getColumnRuns]);

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

  const handleSendInput = useCallback((text: string) => {
    if (!activeAgentId) return;
    const mp = registry.get(activeAgentId);
    mp?.sendInput(text + "\n");
  }, [activeAgentId, registry]);

  useKeybindings({
    onNavigate: handleNavigate,
    onSelect: handleSelect,
    onSwitchPane: () => setFocusPane((p) => p === "kanban" ? "logs" : "kanban"),
    onSetLogMode: setLogMode,
    onApprove: handleApprove,
    onRetry: handleRetry,
    onKill: handleKill,
    onNewRun: () => {},
    onQuit: () => exit(),
    onEnterInput: () => setInputMode(true),
    onExitInput: () => setInputMode(false),
  }, focusPane, inputMode);

  return (
    <Box flexDirection="column" width={termWidth} height={termHeight}>
      <KanbanBoard
        runs={runs}
        selectedRunId={selectedRunId}
        activeRunId={activeAgentId}
        focusedColumnIndex={focusedColumnIndex}
        isFocused={focusPane === "kanban"}
      />
      <LogPane
        selectedRun={selectedRun}
        logMode={logMode}
        events={events}
        outputLines={outputLines}
        isFocused={focusPane === "logs"}
      />
      <InputBar
        isActive={inputMode}
        onSubmit={handleSendInput}
      />
      <StatusBar inputMode={inputMode} />
    </Box>
  );
}
