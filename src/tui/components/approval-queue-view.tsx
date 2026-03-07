import React from "react";
import { Box, Text } from "ink";
import type { ApprovalRequest, WorkflowRun } from "../../state/types.js";

interface ApprovalQueueItem {
  approval: ApprovalRequest;
  run: WorkflowRun | undefined;
}

export type InboxItemKind = "approval" | "plan_revision" | "awaiting_review" | "ready_to_merge" | "blocked" | "escalated";

export interface InboxItem {
  kind: InboxItemKind;
  run: WorkflowRun | undefined;
  approval?: ApprovalRequest;
}

export function resolveInboxItem(
  items: ApprovalQueueItem[],
  planRevisionRuns: WorkflowRun[],
  awaitingReviewRuns: WorkflowRun[],
  readyToMergeRuns: WorkflowRun[],
  escalatedRuns: WorkflowRun[],
  failedRuns: WorkflowRun[],
  index: number,
): InboxItem | null {
  let idx = index;
  if (idx < items.length) {
    return { kind: "approval", run: items[idx].run, approval: items[idx].approval };
  }
  idx -= items.length;
  if (idx < planRevisionRuns.length) {
    return { kind: "plan_revision", run: planRevisionRuns[idx] };
  }
  idx -= planRevisionRuns.length;
  if (idx < awaitingReviewRuns.length) {
    return { kind: "awaiting_review", run: awaitingReviewRuns[idx] };
  }
  idx -= awaitingReviewRuns.length;
  if (idx < readyToMergeRuns.length) {
    return { kind: "ready_to_merge", run: readyToMergeRuns[idx] };
  }
  idx -= readyToMergeRuns.length;
  if (idx < escalatedRuns.length) {
    return { kind: "escalated", run: escalatedRuns[idx] };
  }
  idx -= escalatedRuns.length;
  if (idx < failedRuns.length) {
    return { kind: "blocked", run: failedRuns[idx] };
  }
  return null;
}

interface ApprovalQueueViewProps {
  items: ApprovalQueueItem[];
  planRevisionRuns: WorkflowRun[];
  escalatedRuns: WorkflowRun[];
  failedRuns: WorkflowRun[];
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

function modeBadge(mode: string): React.ReactNode {
  if (mode === "watch") return <Text color="magenta">[W]</Text>;
  if (mode === "autopilot") return <Text color="red">[AP]</Text>;
  return null;
}

function truncTitle(title: string, max: number): string {
  return title.length > max ? title.slice(0, max - 1) + "\u2026" : title;
}

export function ApprovalQueueView({ items, planRevisionRuns, escalatedRuns, failedRuns, awaitingReviewRuns, readyToMergeRuns, selectedIndex, height }: ApprovalQueueViewProps) {
  const allItems: Array<{ key: string; node: React.ReactNode }> = [];
  let selectableIndex = 0;

  // Near-merge PRs summary (non-selectable header)
  const nearMergeCount = [...readyToMergeRuns, ...awaitingReviewRuns].filter((r) => r.prUrl).length;
  if (nearMergeCount > 0) {
    allItems.push({ key: "near-merge-summary", node: (
      <Text bold color="green">Near-Merge PRs: {nearMergeCount}</Text>
    )});
  }

  // Pending approvals section
  if (items.length > 0) {
    allItems.push({ key: "approvals-hdr", node: (
      <Box gap={2}>
        <Text bold>Pending Approvals ({items.length})</Text>
        <Text dimColor>A approve  W rework</Text>
      </Box>
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
          {item.run ? modeBadge(item.run.mode) : null}
          {" "}
          <Text dimColor>{truncTitle(title, 30)}</Text>
          {"  "}
          <Text color={ageColor}>{ageStr}</Text>
        </Text>
      )});
      selectableIndex++;
    }
  }

  // Pending stage reworks section
  if (planRevisionRuns.length > 0) {
    allItems.push({ key: "revision-sep", node: <Text dimColor>{"\u2500".repeat(50)}</Text> });
    allItems.push({ key: "revision-hdr", node: (
      <Box gap={2}>
        <Text bold color="yellow">Pending Reworks ({planRevisionRuns.length})</Text>
        <Text dimColor>A approve  W rework  C continue</Text>
      </Box>
    )});

    for (const r of planRevisionRuns) {
      const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
      const isSelected = selectableIndex === selectedIndex;

      allItems.push({ key: `revision-${r.id}`, node: (
        <Text inverse={isSelected} bold={isSelected}>
          {isSelected ? ">" : " "}
          <Text color="yellow"> #{r.issueNumber}</Text>
          {" "}
          {modeBadge(r.mode)}
          {" "}
          <Text dimColor>{truncTitle(title, 30)}</Text>
          {"  "}
          <Text dimColor>{formatAge(r.updatedAt)}</Text>
        </Text>
      )});
      selectableIndex++;
    }
  }

  // Awaiting human review section
  if (awaitingReviewRuns.length > 0) {
    allItems.push({ key: "review-sep", node: <Text dimColor>{"\u2500".repeat(50)}</Text> });
    allItems.push({ key: "review-hdr", node: (
      <Box gap={2}>
        <Text bold color="cyan">Awaiting Human Review ({awaitingReviewRuns.length})</Text>
        <Text dimColor>C mark reviewed  r rerun reviewer  O open PR</Text>
      </Box>
    )});

    for (const r of awaitingReviewRuns) {
      const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
      const isSelected = selectableIndex === selectedIndex;

      allItems.push({ key: `review-${r.id}`, node: (
        <Text inverse={isSelected} bold={isSelected}>
          {isSelected ? ">" : " "}
          <Text color="cyan"> #{r.issueNumber}</Text>
          {" "}
          {modeBadge(r.mode)}
          {" "}
          <Text dimColor>{truncTitle(title, 30)}</Text>
          {"  "}
          <Text dimColor>{formatAge(r.updatedAt)}</Text>
          {"  "}
          {r.prUrl ? <Text color="cyan">{r.prUrl}</Text> : <Text dimColor>no PR</Text>}
        </Text>
      )});
      selectableIndex++;
    }
  }

  // Ready to merge section
  if (readyToMergeRuns.length > 0) {
    allItems.push({ key: "merge-sep", node: <Text dimColor>{"\u2500".repeat(50)}</Text> });
    allItems.push({ key: "merge-hdr", node: (
      <Box gap={2}>
        <Text bold color="green">Ready to Merge ({readyToMergeRuns.length})</Text>
        <Text dimColor>C mark done  O open PR</Text>
      </Box>
    )});

    for (const r of readyToMergeRuns) {
      const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
      const isSelected = selectableIndex === selectedIndex;

      allItems.push({ key: `merge-${r.id}`, node: (
        <Text inverse={isSelected} bold={isSelected}>
          {isSelected ? ">" : " "}
          <Text color="green"> #{r.issueNumber}</Text>
          {" "}
          {modeBadge(r.mode)}
          {" "}
          <Text dimColor>{truncTitle(title, 30)}</Text>
          {"  "}
          <Text dimColor>{formatAge(r.updatedAt)}</Text>
          {"  "}
          {r.prUrl ? <Text color="cyan">{r.prUrl}</Text> : null}
        </Text>
      )});
      selectableIndex++;
    }
  }

  // Escalated runs section
  if (escalatedRuns.length > 0) {
    allItems.push({ key: "escalated-sep", node: <Text dimColor>{"\u2500".repeat(50)}</Text> });
    allItems.push({ key: "escalated-hdr", node: (
      <Box gap={2}>
        <Text bold color="yellow">Escalated ({escalatedRuns.length})</Text>
        <Text dimColor>Enter open  T take-over</Text>
      </Box>
    )});

    for (const r of escalatedRuns) {
      const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
      const isSelected = selectableIndex === selectedIndex;

      allItems.push({ key: `escalated-${r.id}`, node: (
        <Text inverse={isSelected} bold={isSelected}>
          {isSelected ? ">" : " "}
          <Text color="yellow"> #{r.issueNumber}</Text>
          {" "}
          <Text dimColor>{r.currentPhase ?? ""}</Text>
          {" "}
          <Text dimColor>{truncTitle(title, 25)}</Text>
          {"  "}
          <Text dimColor>{formatAge(r.updatedAt)}</Text>
          {"  "}
          {r.blockedReason ? <Text color="yellow">{truncTitle(r.blockedReason, 30)}</Text> : null}
        </Text>
      )});
      selectableIndex++;
    }
  }

  // Failed runs section
  if (failedRuns.length > 0) {
    allItems.push({ key: "failed-sep", node: <Text dimColor>{"\u2500".repeat(50)}</Text> });
    allItems.push({ key: "failed-hdr", node: (
      <Box gap={2}>
        <Text bold color="red">Failed ({failedRuns.length})</Text>
        <Text dimColor>r retry  Enter open</Text>
      </Box>
    )});

    for (const r of failedRuns) {
      const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
      const isSelected = selectableIndex === selectedIndex;

      allItems.push({ key: `failed-${r.id}`, node: (
        <Text inverse={isSelected} bold={isSelected}>
          {isSelected ? ">" : " "}
          <Text color="red"> #{r.issueNumber}</Text>
          {" "}
          <Text dimColor>{r.currentPhase ?? ""}</Text>
          {" "}
          <Text dimColor>{truncTitle(title, 25)}</Text>
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

  const totalSelectable = items.length + planRevisionRuns.length + awaitingReviewRuns.length + readyToMergeRuns.length + escalatedRuns.length + failedRuns.length;
  const visible = allItems.slice(0, Math.max(height - 4, 5));

  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
      <Box justifyContent="space-between" flexShrink={0}>
        <Text bold color="cyan">Review Inbox</Text>
        <Text dimColor>{totalSelectable} items  j/k nav  Enter open run  Esc back</Text>
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
