import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun, Artifact, StatusTransition, AgentRun, ApprovalRequest } from "../../state/types.js";
import type { RunDetailViewModel } from "../view-models.js";
import { toRunDetailViewModel } from "../view-models.js";

interface SummaryTabProps {
  run: WorkflowRun;
  artifacts: Artifact[];
  transitions: StatusTransition[];
  agentRuns: AgentRun[];
  approvals: ApprovalRequest[];
  isActive: boolean;
  height: number;
}

export function SummaryTab({ run, artifacts, transitions, agentRuns, approvals, isActive, height }: SummaryTabProps) {
  const vm = toRunDetailViewModel(run, artifacts, transitions, agentRuns, approvals, isActive);

  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
      {/* Title + ID */}
      <Box>
        <Text bold>
          <Text color="blue">#{vm.issueNumber}</Text>
          {vm.title ? ` ${vm.title}` : ""}
        </Text>
      </Box>

      {/* Status line */}
      <Box gap={2} marginTop={0}>
        <Text>
          <Text color={vm.statusColor} bold>{vm.humanStatus}</Text>
          {vm.isActive ? <Text color="green"> RUNNING</Text> : ""}
        </Text>
        {vm.phase !== "-" && <Text dimColor>phase: {vm.phase}</Text>}
        {vm.repairRound > 0 && <Text dimColor>repair: {vm.repairRound}</Text>}
        <Text dimColor>age: {vm.age}</Text>
        <Text dimColor>{vm.modeLabel}</Text>
      </Box>

      {/* Runner info */}
      <Box gap={2}>
        {vm.profile && <Text dimColor>profile: {vm.profile}</Text>}
        {vm.model && <Text dimColor>model: {vm.model}</Text>}
        {vm.runner && <Text dimColor>runner: {vm.runner}</Text>}
        {vm.branch && <Text dimColor>branch: {vm.branch}</Text>}
        {vm.prUrl && <Text>PR: <Text color="cyan">{vm.prUrl}</Text></Text>}
      </Box>

      {/* Why paused / blocked */}
      {vm.blocked && (
        <Box borderStyle="single" borderColor={vm.statusColor} flexDirection="column" paddingLeft={1} marginTop={1} flexShrink={0}>
          <Text bold color={vm.statusColor}>{vm.blocked.reason}</Text>
          <Text color="yellow">{vm.blocked.suggestion}</Text>
        </Box>
      )}

      {/* Suggested action */}
      {vm.suggestedAction && !vm.blocked && (
        <Box marginTop={1}>
          <Text color="yellow" bold>
            Next: [{vm.suggestedAction.key}] {vm.suggestedAction.label}
          </Text>
        </Box>
      )}

      {/* Pending approvals */}
      {vm.pendingApprovalCount > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">Pending Approvals ({vm.pendingApprovalCount})</Text>
          {vm.pendingApprovalSummaries.map((s, i) => (
            <Text key={i} dimColor>  {s}</Text>
          ))}
        </Box>
      )}

      {/* Gate chain */}
      {vm.gates.length > 0 && (
        <Box marginTop={1} gap={1}>
          <Text dimColor>Gates:</Text>
          {vm.gates.map((g) => (
            <Text key={g.id} color={g.color}>[{g.icon}{g.phase}]</Text>
          ))}
        </Box>
      )}

      {/* Latest artifact */}
      {vm.latestArtifact && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Latest: <Text color="cyan">{vm.latestArtifact.type}</Text></Text>
          {vm.latestArtifact.summary && (
            <Text dimColor>  {vm.latestArtifact.summary.length > 70 ? vm.latestArtifact.summary.slice(0, 69) + "\u2026" : vm.latestArtifact.summary}</Text>
          )}
        </Box>
      )}

      {/* Quick timeline */}
      {vm.recentTransitions.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Recent</Text>
          {vm.recentTransitions.map((t, i) => (
            <Text key={i} dimColor>
              {t.time} {t.from} → {t.to}
              {t.reason ? ` (${t.reason})` : ""}
            </Text>
          ))}
        </Box>
      )}

      {/* Budget / cost */}
      {(vm.totalCost > 0 || vm.agentRunCount > 0) && (
        <Box marginTop={1} gap={2}>
          <Text dimColor>runs: {vm.agentRunCount}</Text>
          {vm.totalCost > 0 && <Text dimColor>cost: ${vm.totalCost.toFixed(2)}</Text>}
        </Box>
      )}
    </Box>
  );
}
