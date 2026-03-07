import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun } from "../../state/types.js";

interface RunCardProps {
  run: WorkflowRun;
  isSelected: boolean;
  isActive: boolean;
}

const STATUS_BADGE: Record<string, { icon: string; color: string }> = {
  new: { icon: " ", color: "white" },
  triaged: { icon: "T", color: "cyan" },
  plan_draft: { icon: "?", color: "yellow" },
  plan_revision: { icon: "?", color: "yellow" },
  plan_accepted: { icon: "P", color: "green" },
  implementing: { icon: "*", color: "blue" },
  awaiting_local_verify: { icon: "V", color: "blue" },
  draft_pr_opened: { icon: "#", color: "cyan" },
  auto_review_fix_loop: { icon: "X", color: "magenta" },
  awaiting_human_review: { icon: "@", color: "cyan" },
  ready_to_merge: { icon: "M", color: "green" },
  done: { icon: "+", color: "green" },
  escalated: { icon: "!", color: "yellow" },
  failed: { icon: "!", color: "red" },
};

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`;
  return `${Math.floor(ms / 86400_000)}d`;
}

export function RunCard({ run, isSelected, isActive }: RunCardProps) {
  const title = (run.metadata as Record<string, unknown>)?.title as string | undefined;
  const titleShort = title ? (title.length > 18 ? title.slice(0, 17) + "\u2026" : title) : "";
  const badge = STATUS_BADGE[run.status] ?? { icon: "?", color: "gray" };
  const age = formatAge(run.updatedAt);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text
        bold={isSelected}
        inverse={isSelected}
        color={isSelected ? "blue" : undefined}
      >
        <Text color={badge.color}>{badge.icon}</Text>
        {isActive ? <Text color="green">*</Text> : " "}
        #{run.issueNumber} {titleShort}
      </Text>
      <Text dimColor>
        {"  "}
        {run.currentPhase ?? run.status}
        {run.repairRound > 0 ? ` r${run.repairRound}` : ""}
        {" "}
        {age}
        {run.agentProfile ? ` ${run.agentProfile}` : ""}
      </Text>
      {run.blockedReason && (
        <Text dimColor color="red">
          {"  "}
          {run.blockedReason.length > 40 ? run.blockedReason.slice(0, 39) + "\u2026" : run.blockedReason}
        </Text>
      )}
    </Box>
  );
}
