import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun } from "../../state/types.js";
import { RunCard } from "./run-card.js";

interface ColumnProps {
  title: string;
  runs: WorkflowRun[];
  selectedRunId: string | null;
  activeRunId: string | null;
  isFocused: boolean;
}

export function Column({ title, runs, selectedRunId, activeRunId, isFocused }: ColumnProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle={isFocused ? "bold" : "single"}
      borderColor={isFocused ? "blue" : "gray"}
      flexGrow={1}
      flexBasis={0}
      paddingRight={1}
    >
      <Text bold color={isFocused ? "blue" : "white"}> {title} ({runs.length})</Text>
      {runs.map((run) => (
        <RunCard
          key={run.id}
          run={run}
          isSelected={run.id === selectedRunId}
          isActive={run.id === activeRunId}
        />
      ))}
      {runs.length === 0 && <Text dimColor>  (empty)</Text>}
    </Box>
  );
}
