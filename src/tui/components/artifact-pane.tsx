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

const TYPE_LABELS: Record<string, string> = {
  triage_report: "Triage Report",
  plan_draft: "Plan Draft",
  accepted_plan: "Accepted Plan",
  implementation_report: "Implementation Report",
  verification_report: "Verification Report",
  review_report: "Review Report",
  repair_report: "Repair Report",
  gate_verdict: "Gate Verdict",
  diff_summary: "Diff Summary",
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

function renderReviewFindings(
  data: Record<string, unknown>,
  lines: Array<{ key: string; node: React.ReactNode }>,
): void {
  const findings = data.findings as Array<Record<string, unknown>> | undefined;
  if (!findings || findings.length === 0) return;

  const blocking = findings.filter((f) => f.severity === "critical" || f.severity === "major");
  const warnings = findings.filter((f) => f.severity !== "critical" && f.severity !== "major");

  if (blocking.length > 0) {
    lines.push({ key: "findings-block-hdr", node: (
      <Text bold color="red">Blocking ({blocking.length})</Text>
    )});
    for (const [i, f] of blocking.slice(0, 5).entries()) {
      const file = f.file as string ?? "";
      const line = f.line as number ?? 0;
      const msg = f.message as string ?? "";
      const sev = f.severity as string ?? "";
      lines.push({ key: `finding-b${i}`, node: (
        <Text>
          <Text color="red">{sev}</Text>
          {file ? <Text dimColor> {file}{line > 0 ? `:${line}` : ""}</Text> : ""}
          <Text> {truncate(msg, 60)}</Text>
        </Text>
      )});
    }
    if (blocking.length > 5) {
      lines.push({ key: "findings-block-more", node: (
        <Text dimColor>  ...{blocking.length - 5} more blocking</Text>
      )});
    }
  }

  if (warnings.length > 0) {
    lines.push({ key: "findings-warn-hdr", node: (
      <Text bold color="yellow">Warnings ({warnings.length})</Text>
    )});
    for (const [i, f] of warnings.slice(0, 3).entries()) {
      const msg = f.message as string ?? "";
      lines.push({ key: `finding-w${i}`, node: (
        <Text>
          <Text color="yellow">{f.severity as string ?? "warn"}</Text>
          <Text dimColor> {truncate(msg, 60)}</Text>
        </Text>
      )});
    }
    if (warnings.length > 3) {
      lines.push({ key: "findings-warn-more", node: (
        <Text dimColor>  ...{warnings.length - 3} more warnings</Text>
      )});
    }
  }
}

function renderPlanSections(
  data: Record<string, unknown>,
  lines: Array<{ key: string; node: React.ReactNode }>,
): void {
  // Common plan fields
  const steps = data.steps as Array<Record<string, unknown>> | undefined;
  const approach = data.approach as string | undefined;
  const risk = data.risk as string | undefined;

  if (approach) {
    lines.push({ key: "plan-approach", node: (
      <Text>Approach: {truncate(approach, 70)}</Text>
    )});
  }
  if (risk) {
    lines.push({ key: "plan-risk", node: (
      <Text>Risk: <Text color={risk === "high" ? "red" : risk === "medium" ? "yellow" : "green"}>{risk}</Text></Text>
    )});
  }
  if (steps && steps.length > 0) {
    lines.push({ key: "plan-steps-hdr", node: <Text bold>Steps ({steps.length})</Text> });
    for (const [i, step] of steps.slice(0, 6).entries()) {
      const desc = (step.description as string) ?? (step.title as string) ?? `Step ${i + 1}`;
      lines.push({ key: `plan-step-${i}`, node: (
        <Text dimColor>  {i + 1}. {truncate(desc, 65)}</Text>
      )});
    }
    if (steps.length > 6) {
      lines.push({ key: "plan-steps-more", node: (
        <Text dimColor>  ...{steps.length - 6} more steps</Text>
      )});
    }
  }
}

export function ArtifactPane({ artifacts, approvals, isFocused, height }: ArtifactPaneProps) {
  const lines: Array<{ key: string; node: React.ReactNode }> = [];

  // Show latest artifact prominently with expanded detail
  const latest = artifacts.length > 0 ? artifacts[artifacts.length - 1] : null;
  if (latest) {
    const color = TYPE_COLORS[latest.type] ?? "white";
    const label = TYPE_LABELS[latest.type] ?? latest.type;
    lines.push({ key: "latest-hdr", node: (
      <Text bold><Text color={color}>{label}</Text>{verdictBadge(latest)}</Text>
    )});

    // Summary
    if (latest.summary) {
      const summaryLines = latest.summary.split("\n").slice(0, 4);
      for (const [i, line] of summaryLines.entries()) {
        lines.push({ key: `latest-s${i}`, node: (
          <Text>  {truncate(line, 75)}</Text>
        )});
      }
    }

    // Type-specific expanded content
    const data = latest.data as Record<string, unknown>;
    if (latest.type === "review_report" || latest.type === "repair_report") {
      renderReviewFindings(data, lines);
    }
    if (latest.type === "plan_draft" || latest.type === "accepted_plan") {
      renderPlanSections(data, lines);
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
          <Text dimColor> {truncate(a.summary, 55)}</Text>
        </Text>
      )});
    }
    lines.push({ key: "approvals-sep", node: <Text dimColor>{"\u2500".repeat(40)}</Text> });
  }

  // Artifact history (older items)
  if (artifacts.length > 1) {
    lines.push({ key: "history-hdr", node: <Text bold>History</Text> });
    for (const a of artifacts.slice(0, -1).reverse()) {
      const color = TYPE_COLORS[a.type] ?? "white";
      lines.push({ key: `hist-${a.id}`, node: (
        <Text>
          <Text dimColor>{a.createdAt.slice(11, 19)} </Text>
          <Text color={color}>{a.type}</Text>
          {verdictBadge(a)}
          <Text dimColor> {truncate(a.summary, 45)}</Text>
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
