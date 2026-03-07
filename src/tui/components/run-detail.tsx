import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun, AgentRun, Artifact } from "../../state/types.js";

interface StatusTransition {
  from: string;
  to: string;
  reason: string;
  timestamp: string;
}

interface RunDetailProps {
  run: WorkflowRun;
  agentRuns: AgentRun[];
  artifacts: Artifact[];
  transitions: StatusTransition[];
  height: number;
}

const STATUS_COLORS: Record<string, string> = {
  done: "green",
  failed: "red",
  escalated: "yellow",
  awaiting_human_review: "cyan",
  ready_to_merge: "green",
  implementing: "blue",
  auto_review_fix_loop: "magenta",
  draft_pr_opened: "blue",
};

const PHASE_ICONS: Record<string, string> = {
  triage: "T",
  plan: "P",
  implement: "I",
  verify: "V",
  review: "R",
  repair: "X",
  gate: "G",
};

function formatDuration(start: string, end: string | null): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3600_000)}h${Math.floor((ms % 3600_000) / 60_000)}m`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

export function RunDetail({ run, agentRuns, artifacts, transitions, height }: RunDetailProps) {
  const title = (run.metadata as Record<string, unknown>)?.title as string | undefined;
  const statusColor = STATUS_COLORS[run.status] ?? "white";

  // Build sections, then slice to fit height
  const lines: Array<{ key: string; node: React.ReactNode }> = [];

  // Split gate verdicts from other artifacts (used in multiple sections)
  const gateArtifacts = artifacts.filter((a) => a.type === "gate_verdict");
  const otherArtifacts = artifacts.filter((a) => a.type !== "gate_verdict");

  // Header
  lines.push({ key: "hdr", node: (
    <Text bold>
      <Text color="blue">#{run.issueNumber}</Text>
      {title ? ` ${truncate(title, 60)}` : ""}
    </Text>
  )});
  lines.push({ key: "status", node: (
    <Text>
      Status: <Text color={statusColor} bold>{run.status}</Text>
      {run.currentPhase ? <Text dimColor> (phase: {run.currentPhase})</Text> : ""}
      {run.repairRound > 0 ? <Text dimColor> repair:{run.repairRound}</Text> : ""}
    </Text>
  )});
  if (run.branch) {
    lines.push({ key: "branch", node: <Text dimColor>Branch: {run.branch}</Text> });
  }
  if (run.prUrl) {
    lines.push({ key: "pr", node: <Text>PR: <Text color="cyan">{run.prUrl}</Text></Text> });
  }
  lines.push({ key: "time", node: (
    <Text dimColor>
      Created: {run.createdAt.slice(0, 19).replace("T", " ")}
      {"  "}Age: {formatDuration(run.createdAt, null)}
    </Text>
  )});

  // Agent runs (phases) with running phase highlighted
  if (agentRuns.length > 0) {
    lines.push({ key: "phases-hdr", node: <Text bold>{"\n"}Phases</Text> });
    for (const ar of agentRuns) {
      const icon = PHASE_ICONS[ar.phase] ?? "?";
      const dur = formatDuration(ar.startedAt, ar.finishedAt);
      const isRunning = ar.status === "running";
      const statusMark = ar.status === "success" ? "\u2714" : ar.status === "failed" ? "\u2718" : "\u25B6";
      const statusColor = ar.status === "success" ? "green" : ar.status === "failed" ? "red" : "cyan";

      // Check for gate verdict on this phase
      const phaseGate = gateArtifacts.find((g) => g.phase === ar.phase);
      const gateAction = phaseGate ? (phaseGate.data as Record<string, unknown>).action as string : null;
      const gateTag = gateAction === "proceed" ? " \u2714gate" : gateAction === "rework" ? " \u21BAgate" : gateAction ? " \u2718gate" : "";
      const gateColor = gateAction === "proceed" ? "green" : gateAction === "rework" ? "yellow" : "red";

      lines.push({ key: `ar-${ar.id}`, node: (
        <Text>
          <Text color={statusColor}>{statusMark}</Text>
          <Text dimColor>[{icon}]</Text>
          {isRunning ? <Text color="cyan" bold> {ar.phase}</Text> : <Text> {ar.phase}</Text>}
          <Text dimColor> {dur}</Text>
          {ar.iterations ? <Text dimColor> ({ar.iterations} iters)</Text> : ""}
          {gateTag ? <Text color={gateColor}>{gateTag}</Text> : ""}
        </Text>
      )});
    }
  }

  // Gate verdicts (shown prominently before other artifacts)
  if (gateArtifacts.length > 0) {
    lines.push({ key: "gate-hdr", node: <Text bold>{"\n"}Gate Verdicts</Text> });
    for (const g of gateArtifacts) {
      const data = g.data as Record<string, unknown>;
      const action = (data.action as string) ?? "unknown";
      const gateColor = action === "proceed" ? "green" : action === "rework" ? "yellow" : "red";
      const gateIcon = action === "proceed" ? "\u2714" : action === "rework" ? "\u21BA" : "\u2718";
      lines.push({ key: `gate-${g.id}`, node: (
        <Text>
          <Text color={gateColor}>{gateIcon} {g.phase}</Text>
          <Text dimColor> {action} </Text>
          {truncate(g.summary, 60)}
        </Text>
      )});
    }
  }

  // Artifacts (summaries, excluding gate verdicts)
  if (otherArtifacts.length > 0) {
    lines.push({ key: "art-hdr", node: <Text bold>{"\n"}Artifacts</Text> });
    for (const a of otherArtifacts) {
      lines.push({ key: `art-${a.id}`, node: (
        <Text>
          <Text color="yellow">{a.type}</Text>
          <Text dimColor> ({a.phase}) </Text>
          {truncate(a.summary, 70)}
        </Text>
      )});
    }
  }

  // Recent transitions
  if (transitions.length > 0) {
    const recent = transitions.slice(-5);
    lines.push({ key: "tr-hdr", node: <Text bold>{"\n"}Transitions</Text> });
    for (const t of recent) {
      lines.push({ key: `tr-${t.timestamp}`, node: (
        <Text dimColor>
          {t.timestamp.slice(11, 19)} {t.from} {"\u2192"} {t.to}
          {t.reason ? ` (${truncate(t.reason, 40)})` : ""}
        </Text>
      )});
    }
    if (transitions.length > 5) {
      lines.push({ key: "tr-more", node: (
        <Text dimColor>  ...{transitions.length - 5} more</Text>
      )});
    }
  }

  const visible = lines.slice(0, height);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {visible.map((l) => (
        <Box key={l.key}>{l.node}</Box>
      ))}
    </Box>
  );
}
