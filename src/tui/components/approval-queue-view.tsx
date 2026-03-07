import React from "react";
import { Box, Text } from "ink";
import type { ApprovalRequest, WorkflowRun } from "../../state/types.js";

interface ApprovalQueueItem {
  approval: ApprovalRequest;
  run: WorkflowRun | undefined;
}

interface ApprovalQueueViewProps {
  items: ApprovalQueueItem[];
  blockedRuns: WorkflowRun[];
  selectedIndex: number;
  height: number;
}

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`;
  return `${Math.floor(ms / 86400_000)}d`;
}

function urgencyColor(age: number): string {
  if (age > 3600_000) return "red";
  if (age > 600_000) return "yellow";
  return "white";
}

export function ApprovalQueueView({ items, blockedRuns, selectedIndex, height }: ApprovalQueueViewProps) {
  const allItems: Array<{ key: string; node: React.ReactNode }> = [];

  // Pending approvals section
  if (items.length > 0) {
    allItems.push({ key: "approvals-hdr", node: (
      <Text bold>Pending Approvals ({items.length})</Text>
    )});

    for (const [i, item] of items.entries()) {
      const isSelected = i === selectedIndex;
      const age = Date.now() - new Date(item.approval.createdAt).getTime();
      const ageStr = formatAge(item.approval.createdAt);
      const ageColor = urgencyColor(age);
      const title = item.run
        ? ((item.run.metadata as Record<string, unknown>)?.title as string) ?? ""
        : "";

      allItems.push({ key: `approval-${item.approval.id}`, node: (
        <Text inverse={isSelected} bold={isSelected}>
          {isSelected ? ">" : " "}
          <Text color="yellow"> #{item.run?.issueNumber ?? "?"}</Text>
          {" "}
          <Text>{item.approval.phase}</Text>
          {" "}
          <Text dimColor>{title.length > 30 ? title.slice(0, 29) + "\u2026" : title}</Text>
          {"  "}
          <Text color={ageColor}>{ageStr}</Text>
        </Text>
      )});
    }
  }

  // Blocked / escalated runs section
  if (blockedRuns.length > 0) {
    allItems.push({ key: "blocked-sep", node: <Text dimColor>{"\u2500".repeat(50)}</Text> });
    allItems.push({ key: "blocked-hdr", node: (
      <Text bold color="red">Blocked / Escalated ({blockedRuns.length})</Text>
    )});

    for (const r of blockedRuns) {
      const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
      const idx = items.length + blockedRuns.indexOf(r);
      const isSelected = idx === selectedIndex;

      // Find the reason from the latest transition
      allItems.push({ key: `blocked-${r.id}`, node: (
        <Text inverse={isSelected} bold={isSelected}>
          {isSelected ? ">" : " "}
          <Text color="red"> #{r.issueNumber}</Text>
          {" "}
          <Text color={r.status === "escalated" ? "yellow" : "red"}>{r.status}</Text>
          {" "}
          <Text dimColor>{r.currentPhase ?? ""}</Text>
          {" "}
          <Text dimColor>{title.length > 25 ? title.slice(0, 24) + "\u2026" : title}</Text>
          {"  "}
          <Text dimColor>{formatAge(r.updatedAt)}</Text>
        </Text>
      )});
    }
  }

  // Awaiting human review
  const awaitingReview = blockedRuns.filter(() => false); // placeholder for future
  // Could show runs in awaiting_human_review here

  if (allItems.length === 0) {
    allItems.push({ key: "empty", node: <Text dimColor>No pending items. All clear!</Text> });
  }

  const visible = allItems.slice(0, Math.max(height - 4, 5));

  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between" flexShrink={0}>
        <Text bold color="cyan">Approval Queue</Text>
        <Text dimColor>j/k nav  Enter open  A approve  W rework  Esc back</Text>
      </Box>
      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {visible.map((item) => (
          <Box key={item.key}>{item.node}</Box>
        ))}
      </Box>
    </Box>
  );
}

export type { ApprovalQueueItem };
