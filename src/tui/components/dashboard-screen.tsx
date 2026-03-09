import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { WorkflowRun } from "../../state/types.js";
import type { ProcessRegistry } from "../../runner/process-registry.js";
import type { WorkflowConfig } from "../../workflow/config.js";
import { KanbanBoard } from "./kanban-board.js";
import { SummaryBar } from "./summary-bar.js";
import { AutopilotBar } from "./autopilot-bar.js";
import { toOperatorStatus } from "../status-map.js";

interface DashboardScreenProps {
  runs: WorkflowRun[];
  filteredRuns: WorkflowRun[];
  selectedRunId: string | null;
  activeProcessId: string | null;
  focusedColumnIndex: number;
  autopilotRunning: boolean;
  autopilotStats: { lastPoll: string | null; activeCount: number; totalDispatched: number };
  registry: ProcessRegistry;
  config?: WorkflowConfig;
  filterActive: boolean;
  filterQuery: string;
  onFilterChange: (query: string) => void;
  store: { getRecentAgentRuns: (limit?: number) => { costUsd?: number | null }[] };
}

export function DashboardScreen({
  runs,
  filteredRuns,
  selectedRunId,
  activeProcessId,
  focusedColumnIndex,
  autopilotRunning,
  autopilotStats,
  registry,
  config,
  filterActive,
  filterQuery,
  onFilterChange,
  store,
}: DashboardScreenProps) {
  return (
    <>
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
      {filterActive && (
        <Box paddingLeft={1} flexShrink={0}>
          <Text color="cyan">Filter: </Text>
          <TextInput
            value={filterQuery}
            onChange={onFilterChange}
            onSubmit={() => {}}
          />
          <Text dimColor>  [/ to close, type to filter]</Text>
        </Box>
      )}
      <KanbanBoard
        runs={filteredRuns}
        selectedRunId={selectedRunId}
        activeRunId={activeProcessId}
        focusedColumnIndex={focusedColumnIndex}
        isFocused={true}
        compactMode={true}
      />
    </>
  );
}
