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
  awaitingReviewRuns: WorkflowRun[];
  readyToMergeRuns: WorkflowRun[];
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

function severityColor(severity: string): string {
  switch (severity) {
    case "critical": return "red";
    case "high": return "red";
    case "medium": return "yellow";
    case "low": return "green";
    default: return "white";
  }
}

export function ApprovalQueueView({ items, blockedRuns, awaitingReviewRuns, readyToMergeRuns, selectedIndex, height }: ApprovalQueueViewProps) {
  const allItems: Array<{ key: string; node: React.ReactNode }> = [];
  let selectableIndex = 0;

  // Pending approvals section
  if (items.length > 0) {
    allItems.push({ key: "approvals-hdr", node: (
      <Text bold>Pending Approvals ({items.length})</Text>
    )});

    for (const [, item] of items.entries()) {
      const isSelected = selectableIndex === selectedIndex;
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
          {item.approval.recommendedAction ? <Text dimColor> {item.approval.recommendedAction}</Text> : null}
          {item.approval.severity ? (
            <>
              {" "}
              <Text color={severityColor(item.approval.severity)}>[{item.approval.severity}]</Text>
            </>
          ) : null}
          {" "}
          <Text dimColor>{title.length > 30 ? title.slice(0, 29) + "\u2026" : title}</Text>
          {"  "}
          <Text color={ageColor}>{ageStr}</Text>
        </Text>
      )});
      selectableIndex++;
    }
  }

  // Awaiting human review section
  if (awaitingReviewRuns.length > 0) {
    allItems.push({ key: "review-sep", node: <Text dimColor>{"\u2500".repeat(50)}</Text> });
    allItems.push({ key: "review-hdr", node: (
      <Text bold color="cyan">Awaiting Human Review ({awaitingReviewRuns.length})</Text>
    )});

    for (const r of awaitingReviewRuns) {
      const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
      const isSelected = selectableIndex === selectedIndex;

      allItems.push({ key: `review-${r.id}`, node: (
        <Text inverse={isSelected} bold={isSelected}>
          {isSelected ? ">" : " "}
          <Text color="cyan"> #{r.issueNumber}</Text>
          {" "}
          <Text color="cyan">review</Text>
          {" "}
          <Text dimColor>{title.length > 30 ? title.slice(0, 29) + "\u2026" : title}</Text>
          {"  "}
          <Text dimColor>{formatAge(r.updatedAt)}</Text>
          {"  "}
          <Text dimColor>PR: {r.prUrl ?? "no PR"}</Text>
        </Text>
      )});
      selectableIndex++;
    }
  }

  // Ready to merge section
  if (readyToMergeRuns.length > 0) {
    allItems.push({ key: "merge-sep", node: <Text dimColor>{"\u2500".repeat(50)}</Text> });
    allItems.push({ key: "merge-hdr", node: (
      <Text bold color="green">Ready to Merge ({readyToMergeRuns.length})</Text>
    )});

    for (const r of readyToMergeRuns) {
      const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
      const isSelected = selectableIndex === selectedIndex;

      allItems.push({ key: `merge-${r.id}`, node: (
        <Text inverse={isSelected} bold={isSelected}>
          {isSelected ? ">" : " "}
          <Text color="green"> #{r.issueNumber}</Text>
          {" "}
          <Text color="green">merge</Text>
          {" "}
          <Text dimColor>{title.length > 30 ? title.slice(0, 29) + "\u2026" : title}</Text>
          {"  "}
          <Text dimColor>{formatAge(r.updatedAt)}</Text>
        </Text>
      )});
      selectableIndex++;
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
      const isSelected = selectableIndex === selectedIndex;

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
      selectableIndex++;
    }
  }

  if (allItems.length === 0) {
    allItems.push({ key: "empty", node: <Text dimColor>No pending items. All clear!</Text> });
  }

  const visible = allItems.slice(0, Math.max(height - 4, 5));

  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between" flexShrink={0}>
        <Text bold color="cyan">Approval Queue</Text>
        <Text dimColor>j/k nav  Enter open  A approve  W rework  O open PR  C done  Esc back</Text>
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
