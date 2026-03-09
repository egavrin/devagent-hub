import React from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { WorkflowRun } from "../../state/types.js";
import type { ProcessRegistry } from "../../runner/process-registry.js";
import type { WorkflowConfig } from "../../workflow/config.js";
import type { LayoutMode } from "../hooks/use-layout.js";
import { KanbanBoard } from "./kanban-board.js";
import { RunListView } from "./run-list-view.js";
import { SummaryBar } from "./summary-bar.js";
import { AutopilotBar } from "./autopilot-bar.js";
import { RunCardPreview } from "./run-card-preview.js";
import { toBoardSummaryViewModel } from "../view-models.js";

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
  layoutMode: LayoutMode;
  previewWidth: number;
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
  layoutMode,
  previewWidth,
}: DashboardScreenProps) {
  const summary = toBoardSummaryViewModel(runs);
  const selectedRun = selectedRunId ? filteredRuns.find((r) => r.id === selectedRunId) ?? null : null;

  return (
    <>
      <SummaryBar
        mode={summary.mode}
        runningCount={summary.runningCount}
        needsActionCount={summary.needsActionCount}
        blockedCount={summary.blockedCount}
        failedCount={summary.failedCount}
        doneCount={summary.doneCount}
        totalCount={summary.totalCount}
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

      {layoutMode === "narrow" ? (
        /* Narrow: single-column list */
        <RunListView
          runs={filteredRuns}
          selectedRunId={selectedRunId}
          activeRunId={activeProcessId}
        />
      ) : layoutMode === "wide" ? (
        /* Wide: board + preview pane */
        <Box flexDirection="row" width="100%">
          <Box flexGrow={1}>
            <KanbanBoard
              runs={filteredRuns}
              selectedRunId={selectedRunId}
              activeRunId={activeProcessId}
              focusedColumnIndex={focusedColumnIndex}
              isFocused={true}
              compactMode={true}
            />
          </Box>
          <Box width={previewWidth} flexShrink={0} borderStyle="single" borderColor="gray" flexDirection="column" paddingLeft={1}>
            <RunCardPreview run={selectedRun} />
          </Box>
        </Box>
      ) : (
        /* Normal: compact board */
        <KanbanBoard
          runs={filteredRuns}
          selectedRunId={selectedRunId}
          activeRunId={activeProcessId}
          focusedColumnIndex={focusedColumnIndex}
          isFocused={true}
          compactMode={true}
        />
      )}
    </>
  );
}
