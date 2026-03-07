import React from "react";
import { Box, Text } from "ink";
import type { Artifact, ApprovalRequest } from "../../state/types.js";

interface ArtifactPaneProps {
  artifacts: Artifact[];
  approvals: ApprovalRequest[];
  isFocused: boolean;
  height: number;
}

const TYPE_COLORS: Record<string, string> = {
  triage_report: "cyan",
  plan_draft: "yellow",
  accepted_plan: "green",
  implementation_report: "blue",
  verification_report: "green",
  review_report: "magenta",
  repair_report: "red",
  gate_verdict: "white",
  diff_summary: "gray",
};

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

function verdictBadge(artifact: Artifact): React.ReactNode {
  const data = artifact.data as Record<string, unknown>;

  if (artifact.type === "gate_verdict") {
    const action = data.action as string;
    const color = action === "proceed" ? "green" : action === "rework" ? "yellow" : "red";
    const icon = action === "proceed" ? "PASS" : action === "rework" ? "REWORK" : "BLOCK";
    return <Text color={color} bold> [{icon}]</Text>;
  }

  if (artifact.type === "review_report") {
    const verdict = data.verdict as string;
    const blocking = data.blockingCount as number ?? 0;
    if (verdict === "block" || blocking > 0) {
      return <Text color="red" bold> [BLOCK:{blocking}]</Text>;
    }
    return <Text color="green" bold> [PASS]</Text>;
  }

  return null;
}

export function ArtifactPane({ artifacts, approvals, isFocused, height }: ArtifactPaneProps) {
  const lines: Array<{ key: string; node: React.ReactNode }> = [];

  // Show latest artifact prominently
  const latest = artifacts.length > 0 ? artifacts[artifacts.length - 1] : null;
  if (latest) {
    const color = TYPE_COLORS[latest.type] ?? "white";
    lines.push({ key: "latest-hdr", node: (
      <Text bold>Latest: <Text color={color}>{latest.type}</Text>{verdictBadge(latest)}</Text>
    )});
    if (latest.summary) {
      const summaryLines = latest.summary.split("\n").slice(0, 5);
      for (const [i, line] of summaryLines.entries()) {
        lines.push({ key: `latest-s${i}`, node: (
          <Text>  {truncate(line, 80)}</Text>
        )});
      }
    }
    lines.push({ key: "latest-sep", node: <Text dimColor>{"\u2500".repeat(40)}</Text> });
  }

  // Pending approvals
  const pending = approvals.filter((a) => a.action === null);
  if (pending.length > 0) {
    lines.push({ key: "approvals-hdr", node: (
      <Text bold color="yellow">Pending Approvals ({pending.length})</Text>
    )});
    for (const a of pending) {
      lines.push({ key: `approval-${a.id}`, node: (
        <Text>
          <Text color="yellow">{a.phase}</Text>
          <Text dimColor> {truncate(a.summary, 60)}</Text>
        </Text>
      )});
    }
    lines.push({ key: "approvals-sep", node: <Text dimColor>{"\u2500".repeat(40)}</Text> });
  }

  // All artifacts history
  if (artifacts.length > 1) {
    lines.push({ key: "history-hdr", node: <Text bold>Artifact History</Text> });
    for (const a of artifacts.slice(0, -1).reverse()) {
      const color = TYPE_COLORS[a.type] ?? "white";
      lines.push({ key: `hist-${a.id}`, node: (
        <Text>
          <Text dimColor>{a.createdAt.slice(11, 19)} </Text>
          <Text color={color}>{a.type}</Text>
          {verdictBadge(a)}
          <Text dimColor> {truncate(a.summary, 50)}</Text>
        </Text>
      )});
    }
  }

  if (lines.length === 0) {
    lines.push({ key: "empty", node: <Text dimColor>No artifacts yet</Text> });
  }

  const visible = lines.slice(0, Math.max(height - 3, 3));

  return (
    <Box
      borderStyle={isFocused ? "bold" : "single"}
      borderColor={isFocused ? "blue" : "gray"}
      flexDirection="column"
      flexGrow={1}
      paddingLeft={1}
      overflow="hidden"
    >
      <Text bold dimColor>Artifacts</Text>
      {visible.map((l) => (
        <Box key={l.key}>{l.node}</Box>
      ))}
    </Box>
  );
}
