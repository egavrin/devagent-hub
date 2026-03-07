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
  implementing: "blue",
  auto_review_fix_loop: "magenta",
};

const PHASE_ICONS: Record<string, string> = {
  triage: "T",
  plan: "P",
  implement: "I",
  verify: "V",
  review: "R",
  repair: "X",
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

  // Agent runs (phases)
  if (agentRuns.length > 0) {
    lines.push({ key: "phases-hdr", node: <Text bold>{"\n"}Phases</Text> });
    for (const ar of agentRuns) {
      const icon = PHASE_ICONS[ar.phase] ?? "?";
      const dur = formatDuration(ar.startedAt, ar.finishedAt);
      const statusMark = ar.status === "success" ? "ok" : ar.status === "failed" ? "!!" : "..";
      lines.push({ key: `ar-${ar.id}`, node: (
        <Text>
          <Text dimColor>[{icon}]</Text> {ar.phase}
          <Text dimColor> {statusMark} {dur}</Text>
          {ar.iterations ? <Text dimColor> ({ar.iterations} iters)</Text> : ""}
        </Text>
      )});
    }
  }

  // Artifacts (summaries)
  if (artifacts.length > 0) {
    lines.push({ key: "art-hdr", node: <Text bold>{"\n"}Artifacts</Text> });
    for (const a of artifacts) {
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
