import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun, Artifact, AgentRun } from "../../state/types.js";

interface RunHeaderProps {
  run: WorkflowRun;
  isActive: boolean;
  gateVerdicts?: Artifact[];
  latestAgentRun?: AgentRun | null;
}

const STATUS_COLORS: Record<string, string> = {
  new: "white",
  triaged: "cyan",
  plan_draft: "yellow",
  plan_revision: "yellow",
  plan_accepted: "green",
  implementing: "blue",
  awaiting_local_verify: "blue",
  draft_pr_opened: "cyan",
  auto_review_fix_loop: "magenta",
  awaiting_human_review: "cyan",
  ready_to_merge: "green",
  done: "green",
  escalated: "yellow",
  failed: "red",
};

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`;
  return `${Math.floor(ms / 86400_000)}d`;
}

function nextActionHint(status: string): { text: string; urgent: boolean } {
  switch (status) {
    case "new": return { text: "C triage", urgent: false };
    case "triaged": return { text: "C plan", urgent: false };
    case "plan_draft": return { text: "A approve  W rework", urgent: true };
    case "plan_revision": return { text: "A approve", urgent: true };
    case "plan_accepted": return { text: "C implement", urgent: false };
    case "implementing": return { text: "Running...", urgent: false };
    case "awaiting_local_verify": return { text: "C open PR", urgent: false };
    case "draft_pr_opened": return { text: "C review", urgent: false };
    case "auto_review_fix_loop": return { text: "C repair", urgent: true };
    case "awaiting_human_review": return { text: "A approve  C mark reviewed  O open PR", urgent: true };
    case "ready_to_merge": return { text: "A mark done  O open PR", urgent: true };
    case "done": return { text: "Complete", urgent: false };
    case "escalated": return { text: "T take-over  R retry", urgent: true };
    case "failed": return { text: "r retry  R rerun-profile", urgent: true };
    default: return { text: "", urgent: false };
  }
}

function GateChain({ gateVerdicts }: { gateVerdicts: Artifact[] }) {
  if (!gateVerdicts || gateVerdicts.length === 0) return null;

  return (
    <Box gap={1}>
      <Text dimColor>Gates:</Text>
      {gateVerdicts.map((g) => {
        const data = g.data as Record<string, unknown>;
        const action = (data.action as string) ?? "?";
        const color = action === "proceed" ? "green" : action === "rework" ? "yellow" : "red";
        const icon = action === "proceed" ? "+" : action === "rework" ? "~" : "x";
        return (
          <Text key={g.id} color={color}>[{icon}{g.phase}]</Text>
        );
      })}
    </Box>
  );
}

export function RunHeader({ run, isActive, gateVerdicts, latestAgentRun }: RunHeaderProps) {
  const title = (run.metadata as Record<string, unknown>)?.title as string | undefined;
  const statusColor = STATUS_COLORS[run.status] ?? "white";
  const repoShort = run.repo.split("/").pop() ?? run.repo;
  const hint = nextActionHint(run.status);

  return (
    <Box flexDirection="column" paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between">
        <Text bold>
          <Text color="blue">#{run.issueNumber}</Text>
          {title ? ` ${title}` : ""}
        </Text>
        <Box gap={2}>
          <Text color={run.mode === "watch" ? "magenta" : run.mode === "autopilot" ? "red" : "gray"} bold>
            {run.mode === "watch" ? "[WATCH]" : run.mode === "autopilot" ? "[AUTOPILOT]" : "[ASSISTED]"}
          </Text>
          <Text dimColor>{repoShort}</Text>
        </Box>
      </Box>

      <Box gap={2}>
        <Text>
          Status: <Text color={statusColor} bold>{run.status}</Text>
          {isActive ? <Text color="green"> RUNNING</Text> : ""}
        </Text>
        {run.currentPhase && (
          <Text dimColor>Phase: {run.currentPhase}</Text>
        )}
        {run.repairRound > 0 && (
          <Text dimColor>Repair: {run.repairRound}</Text>
        )}
        <Text dimColor>Age: {formatAge(run.createdAt)}</Text>
      </Box>

      {(run.runnerId || run.agentProfile || latestAgentRun?.executorKind || run.actualModel) && (
        <Box gap={2}>
          {run.agentProfile && <Text dimColor>Profile: {run.agentProfile}</Text>}
          {run.runnerId && <Text dimColor>Runner: {run.runnerId}</Text>}
          {latestAgentRun?.executorKind && (
            <Text dimColor>Role: <Text color="cyan">{latestAgentRun.executorKind}</Text></Text>
          )}
          {run.actualModel && <Text dimColor>Model: {run.actualModel}</Text>}
        </Box>
      )}

      <Box gap={2}>
        {run.branch && <Text dimColor>Branch: {run.branch}</Text>}
        {run.prUrl && <Text>PR: <Text color="cyan">{run.prUrl}</Text></Text>}
      </Box>

      <GateChain gateVerdicts={gateVerdicts ?? []} />

      {/* Sticky blocked reason — prominent red bar */}
      {run.blockedReason && (
        <Box>
          <Text color="red" bold>BLOCKED: </Text>
          <Text color="red">{run.blockedReason}</Text>
        </Box>
      )}

      {run.nextAction && (
        <Box>
          <Text dimColor>Next: </Text>
          <Text color="cyan">{run.nextAction}</Text>
        </Box>
      )}

      {/* Sticky next-decision bar */}
      {hint.text && (
        <Box>
          <Text color={hint.urgent ? "yellow" : "gray"} bold={hint.urgent}>
            {hint.urgent ? "▸ " : ""}{hint.text}
          </Text>
        </Box>
      )}
    </Box>
  );
}
