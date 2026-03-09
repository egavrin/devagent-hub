import React from "react";
import { Box, Text } from "ink";
import type { WorkflowMode } from "../../state/types.js";

interface SummaryBarProps {
  mode: WorkflowMode | null;
  runningCount: number;
  needsActionCount: number;
  blockedCount: number;
  failedCount: number;
  doneCount: number;
  totalCount: number;
  autopilotOn: boolean;
  activeRunners: number;
}

export function SummaryBar({
  mode,
  runningCount,
  needsActionCount,
  blockedCount,
  failedCount,
  doneCount,
  totalCount,
  autopilotOn,
  activeRunners,
}: SummaryBarProps) {
  return (
    <Box paddingLeft={1} paddingRight={1} flexShrink={0}>
      <Text color="cyan" bold>
        {mode ?? "assisted"}
      </Text>
      <Text dimColor>{" | "}</Text>
      <Text color="blue">{runningCount} running</Text>
      <Text dimColor>{" | "}</Text>
      {needsActionCount > 0 ? (
        <Text color="yellow" bold>{needsActionCount} needs action</Text>
      ) : (
        <Text dimColor>0 needs action</Text>
      )}
      <Text dimColor>{" | "}</Text>
      {blockedCount > 0 ? (
        <Text color="red">{blockedCount} blocked</Text>
      ) : (
        <Text dimColor>0 blocked</Text>
      )}
      <Text dimColor>{" | "}</Text>
      {failedCount > 0 ? (
        <Text color="red" bold>{failedCount} failed</Text>
      ) : (
        <Text dimColor>0 failed</Text>
      )}
      <Text dimColor>{" | "}</Text>
      <Text color="green">{doneCount} done</Text>
      <Text dimColor>{" | "}</Text>
      <Text dimColor>{totalCount} total</Text>
      <Text dimColor>{" | "}</Text>
      <Text dimColor>runners:{activeRunners}</Text>
      {autopilotOn && (
        <>
          <Text dimColor>{" | "}</Text>
          <Text color="magenta" bold>AUTOPILOT</Text>
        </>
      )}
    </Box>
  );
}
