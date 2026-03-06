import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun, AgentRun, StatusTransition } from "../../state/types.js";

interface DetailPanelProps {
  run: WorkflowRun;
  transitions: StatusTransition[];
  agentRuns: AgentRun[];
  isFocused: boolean;
}

export function DetailPanel({ run, transitions, agentRuns, isFocused }: DetailPanelProps) {
  const repoShort = run.repo.split("/").pop() ?? run.repo;

  return (
    <Box
      borderStyle={isFocused ? "bold" : "single"}
      borderColor={isFocused ? "blue" : "gray"}
      flexDirection="column"
      flexGrow={1}
      padding={1}
    >
      <Text bold color="blue">
        {">"} #{run.issueNumber} {repoShort} — {run.status}
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Details</Text>
        <Text>  ID:      {run.id}</Text>
        <Text>  Repo:    {run.repo}</Text>
        <Text>  Branch:  {run.branch ?? "(none)"}</Text>
        <Text>  Phase:   {run.currentPhase ?? "(none)"}</Text>
        {run.prUrl && <Text>  PR:      {run.prUrl}</Text>}
        <Text>  Repair:  {run.repairRound}</Text>
        <Text>  Created: {run.createdAt}</Text>
        <Text>  Updated: {run.updatedAt}</Text>
      </Box>

      {agentRuns.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Agent Runs</Text>
          {agentRuns.map((ar) => (
            <Text key={ar.id} color={ar.status === "success" ? "green" : ar.status === "failed" ? "red" : "yellow"}>
              {"  "}{ar.phase.padEnd(10)} {ar.status.padEnd(8)} {ar.startedAt.split("T")[1]?.slice(0, 8) ?? ""}
              {ar.finishedAt ? ` → ${ar.finishedAt.split("T")[1]?.slice(0, 8) ?? ""}` : ""}
            </Text>
          ))}
        </Box>
      )}

      {transitions.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Transitions</Text>
          {transitions.slice(-10).map((t, i) => (
            <Text key={i} dimColor>
              {"  "}{t.from} → {t.to}  {t.timestamp.split("T")[1]?.slice(0, 8) ?? ""}  ({t.reason})
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>D delete  A approve  R retry  K kill  Esc back</Text>
      </Box>
    </Box>
  );
}
