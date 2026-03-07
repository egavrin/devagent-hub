import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun } from "../../state/types.js";

interface RunHeaderProps {
  run: WorkflowRun;
  isActive: boolean;
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

function nextActionHint(status: string): string {
  switch (status) {
    case "new": return "Press C to triage";
    case "triaged": return "Press C to plan";
    case "plan_draft": return "Press A to approve, W to rework";
    case "plan_revision": return "Press A to approve";
    case "plan_accepted": return "Press C to implement";
    case "implementing": return "Running...";
    case "awaiting_local_verify": return "Press C to open PR";
    case "draft_pr_opened": return "Press C to review";
    case "auto_review_fix_loop": return "Press C to repair";
    case "awaiting_human_review": return "Awaiting human review";
    case "ready_to_merge": return "Ready to merge";
    case "done": return "Complete";
    case "escalated": return "Needs human intervention";
    case "failed": return "Press R to retry";
    default: return "";
  }
}

export function RunHeader({ run, isActive }: RunHeaderProps) {
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
        <Text dimColor>{repoShort}</Text>
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

      <Box gap={2}>
        {run.branch && <Text dimColor>Branch: {run.branch}</Text>}
        {run.prUrl && <Text>PR: <Text color="cyan">{run.prUrl}</Text></Text>}
      </Box>

      {hint && (
        <Text color="yellow">{hint}</Text>
      )}
    </Box>
  );
}
