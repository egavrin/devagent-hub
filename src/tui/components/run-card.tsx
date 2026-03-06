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
  const repoShort = run.repo.split("/").pop() ?? run.repo;
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
        {indicator}#{run.issueNumber} {repoShort}
      </Text>
      <Text dimColor>  {statusIcon} {run.status}</Text>
    </Box>
  );
}
