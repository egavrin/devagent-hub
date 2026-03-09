import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun } from "../../state/types.js";
import { humanStatus, operatorStatusColor, toOperatorStatus, suggestedAction } from "../status-map.js";

interface RunCardProps {
  run: WorkflowRun;
  isSelected: boolean;
  isActive: boolean;
}

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`;
  return `${Math.floor(ms / 86400_000)}d`;
}

export function RunCard({ run, isSelected, isActive }: RunCardProps) {
  const title = (run.metadata as Record<string, unknown>)?.title as string | undefined;
  const titleShort = title ? (title.length > 22 ? title.slice(0, 21) + "\u2026" : title) : "";
  const age = formatAge(run.updatedAt);
  const opStatus = toOperatorStatus(run.status);
  const statusColor = operatorStatusColor(opStatus);
  const action = suggestedAction(run.status);

  // Line 1: ID + title
  // Line 2: phase + human status + age
  // Line 3: badges (PR, blocked, suggested action)
  return (
    <Box flexDirection="column" paddingLeft={1}>
      {/* Line 1: ID + title */}
      <Text
        bold={isSelected}
        inverse={isSelected}
        color={isSelected ? "blue" : undefined}
      >
        {isActive ? <Text color="green">*</Text> : " "}
        #{run.issueNumber} {titleShort}
      </Text>
      {/* Line 2: phase + human status + age */}
      <Text dimColor>
        {"  "}
        {run.currentPhase ?? "-"}
        <Text color={statusColor}> {humanStatus(run.status)}</Text>
        {run.repairRound > 0 ? ` r${run.repairRound}` : ""}
        {" "}
        {age}
      </Text>
      {/* Line 3: badges */}
      <Text dimColor>
        {"  "}
        {run.prUrl ? <Text color="green">PR </Text> : null}
        {run.blockedReason ? (
          <Text color="red">! {run.blockedReason.length > 20 ? run.blockedReason.slice(0, 19) + "\u2026" : run.blockedReason} </Text>
        ) : null}
        {isSelected && action ? (
          <Text color="yellow">[{action.key}] {action.label}</Text>
        ) : null}
      </Text>
    </Box>
  );
}
