import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun } from "../../state/types.js";

interface RunCardProps {
  run: WorkflowRun;
  isSelected: boolean;
  isActive: boolean;
}

export function RunCard({ run, isSelected, isActive }: RunCardProps) {
  const indicator = isActive ? ">" : " ";
  const title = (run.metadata as Record<string, unknown>)?.title as string | undefined;
  const titleShort = title ? (title.length > 20 ? title.slice(0, 19) + "\u2026" : title) : "";
  const statusIcon = run.status === "done" ? "ok" :
    run.status === "failed" ? "!!" :
    run.status === "escalated" ? "^^" : "..";

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text
        bold={isSelected}
        inverse={isSelected}
        color={isSelected ? "blue" : undefined}
      >
        {indicator}#{run.issueNumber} {titleShort}
      </Text>
      <Text dimColor>  {statusIcon} {run.status}</Text>
    </Box>
  );
}
