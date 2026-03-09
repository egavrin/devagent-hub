import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun } from "../../state/types.js";
import type { LayoutMode } from "../hooks/use-layout.js";
import { RunCard } from "./run-card.js";

interface ColumnProps {
  title: string;
  runs: WorkflowRun[];
  selectedRunId: string | null;
  activeRunId: string | null;
  isFocused: boolean;
  titleColor?: string;
  layoutMode?: LayoutMode;
}

export function Column({ title, runs, selectedRunId, activeRunId, isFocused, titleColor, layoutMode = "normal" }: ColumnProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle={isFocused ? "bold" : "single"}
      borderColor={isFocused ? "blue" : "gray"}
      flexGrow={1}
      flexBasis={0}
      paddingRight={1}
    >
      <Text bold color={isFocused ? "blue" : (titleColor ?? "white")}> {title} ({runs.length})</Text>
      {runs.map((run) => (
        <RunCard
          key={run.id}
          run={run}
          isSelected={run.id === selectedRunId}
          isActive={run.id === activeRunId}
          layoutMode={layoutMode}
        />
      ))}
    </Box>
  );
}
