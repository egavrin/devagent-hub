import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun, Artifact, StatusTransition, AgentRun, ApprovalRequest } from "../../state/types.js";
import { humanStatus, operatorStatusColor, toOperatorStatus, suggestedAction } from "../status-map.js";

interface SummaryTabProps {
  run: WorkflowRun;
  artifacts: Artifact[];
  transitions: StatusTransition[];
  agentRuns: AgentRun[];
  approvals: ApprovalRequest[];
  isActive: boolean;
  height: number;
}

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`;
  return `${Math.floor(ms / 86400_000)}d`;
}

function getBlockedReason(
  run: WorkflowRun,
  transitions: StatusTransition[],
): { reason: string; suggestion: string } | null {
  const lastT = transitions.length > 0 ? transitions[transitions.length - 1] : null;

  switch (run.status) {
    case "failed":
      return {
        reason: `Failed at ${run.currentPhase ?? "unknown"}: ${lastT?.reason ?? "Unknown error"}`,
        suggestion: "R to retry, D to delete",
      };
    case "escalated":
      return {
        reason: `Escalated: ${lastT?.reason ?? "By policy"}`,
        suggestion: "Review artifacts, then retry or close",
      };
    case "plan_draft":
    case "plan_revision":
      return {
        reason: "Plan needs approval",
        suggestion: "A to approve, W to rework",
      };
    case "awaiting_human_review":
      return {
        reason: "PR ready for human review",
        suggestion: "A to approve, r to rerun reviewer",
      };
    case "awaiting_local_verify":
      return {
        reason: "Implementation done, needs verify/PR",
        suggestion: "C to continue",
      };
    case "auto_review_fix_loop":
      return {
        reason: "Auto-review found issues, repairing",
        suggestion: "C to repair",
      };
    default:
      return null;
  }
}

export function SummaryTab({ run, artifacts, transitions, agentRuns, approvals, isActive, height }: SummaryTabProps) {
  const title = (run.metadata as Record<string, unknown>)?.title as string | undefined;
  const opStatus = toOperatorStatus(run.status);
  const statusColor = operatorStatusColor(opStatus);
  const action = suggestedAction(run.status);
  const blocked = getBlockedReason(run, transitions);
  const totalCost = agentRuns.reduce((sum, ar) => sum + (ar.costUsd ?? 0), 0);
  const pendingApprovals = approvals.filter((a) => a.action === null);

  // Latest artifact summary
  const latestArtifact = artifacts.length > 0 ? artifacts[artifacts.length - 1] : null;

  // Quick timeline: last 5 transitions
  const recentTransitions = transitions.slice(-5);

  // Gate verdicts
  const gates = artifacts.filter((a) => a.type === "gate_verdict");

  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
      {/* Title + ID */}
      <Box>
        <Text bold>
          <Text color="blue">#{run.issueNumber}</Text>
          {title ? ` ${title}` : ""}
        </Text>
      </Box>

      {/* Status line */}
      <Box gap={2} marginTop={0}>
        <Text>
          <Text color={statusColor} bold>{humanStatus(run.status)}</Text>
          {isActive ? <Text color="green"> RUNNING</Text> : ""}
        </Text>
        {run.currentPhase && <Text dimColor>phase: {run.currentPhase}</Text>}
        {run.repairRound > 0 && <Text dimColor>repair: {run.repairRound}</Text>}
        <Text dimColor>age: {formatAge(run.createdAt)}</Text>
        <Text dimColor>
          {run.mode === "watch" ? "[WATCH]" : run.mode === "autopilot" ? "[AUTO]" : "[ASSISTED]"}
        </Text>
      </Box>

      {/* Runner info */}
      <Box gap={2}>
        {run.agentProfile && <Text dimColor>profile: {run.agentProfile}</Text>}
        {run.actualModel && <Text dimColor>model: {run.actualModel}</Text>}
        {run.runnerId && <Text dimColor>runner: {run.runnerId}</Text>}
        {run.branch && <Text dimColor>branch: {run.branch}</Text>}
        {run.prUrl && <Text>PR: <Text color="cyan">{run.prUrl}</Text></Text>}
      </Box>

      {/* Why paused / blocked — prominent */}
      {blocked && (
        <Box borderStyle="single" borderColor={statusColor} flexDirection="column" paddingLeft={1} marginTop={1} flexShrink={0}>
          <Text bold color={statusColor}>{blocked.reason}</Text>
          <Text color="yellow">{blocked.suggestion}</Text>
        </Box>
      )}

      {/* Suggested action — big and clear */}
      {action && !blocked && (
        <Box marginTop={1}>
          <Text color="yellow" bold>
            Next: [{action.key}] {action.label}
          </Text>
        </Box>
      )}

      {/* Pending approvals */}
      {pendingApprovals.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">Pending Approvals ({pendingApprovals.length})</Text>
          {pendingApprovals.slice(0, 3).map((a) => (
            <Text key={a.id} dimColor>  {a.phase}: {a.summary.length > 50 ? a.summary.slice(0, 49) + "\u2026" : a.summary}</Text>
          ))}
        </Box>
      )}

      {/* Gate chain */}
      {gates.length > 0 && (
        <Box marginTop={1} gap={1}>
          <Text dimColor>Gates:</Text>
          {gates.map((g) => {
            const data = g.data as Record<string, unknown>;
            const gAction = (data.action as string) ?? "?";
            const color = gAction === "proceed" ? "green" : gAction === "rework" ? "yellow" : "red";
            const icon = gAction === "proceed" ? "+" : gAction === "rework" ? "~" : "x";
            return <Text key={g.id} color={color}>[{icon}{g.phase}]</Text>;
          })}
        </Box>
      )}

      {/* Latest artifact */}
      {latestArtifact && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Latest: <Text color="cyan">{latestArtifact.type.replace(/_/g, " ")}</Text></Text>
          {latestArtifact.summary && (
            <Text dimColor>  {latestArtifact.summary.length > 70 ? latestArtifact.summary.slice(0, 69) + "\u2026" : latestArtifact.summary}</Text>
          )}
        </Box>
      )}

      {/* Quick timeline */}
      {recentTransitions.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Recent</Text>
          {recentTransitions.map((t, i) => (
            <Text key={i} dimColor>
              {t.timestamp.slice(11, 19)} {t.from} → {t.to}
              {t.reason ? ` (${t.reason.length > 30 ? t.reason.slice(0, 29) + "\u2026" : t.reason})` : ""}
            </Text>
          ))}
        </Box>
      )}

      {/* Budget / cost */}
      {(totalCost > 0 || agentRuns.length > 0) && (
        <Box marginTop={1} gap={2}>
          <Text dimColor>runs: {agentRuns.length}</Text>
          {totalCost > 0 && <Text dimColor>cost: ${totalCost.toFixed(2)}</Text>}
        </Box>
      )}
    </Box>
  );
}
