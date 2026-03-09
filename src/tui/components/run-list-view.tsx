import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun } from "../../state/types.js";
import { RunCard } from "./run-card.js";

interface RunListViewProps {
  runs: WorkflowRun[];
  selectedRunId: string | null;
  activeRunId: string | null;
}

/** Single-column list for narrow terminals (<80 cols) */
export function RunListView({ runs, selectedRunId, activeRunId }: RunListViewProps) {
  if (runs.length === 0) {
    return (
      <Box padding={1}>
        <Text dimColor>No workflow runs yet — press N to start</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      {runs.map((run) => (
        <RunCard
          key={run.id}
          run={run}
          isSelected={run.id === selectedRunId}
          isActive={run.id === activeRunId}
          layoutMode="narrow"
        />
      ))}
    </Box>
  );
}
