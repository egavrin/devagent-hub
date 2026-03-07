import React from "react";
import { Box, Text } from "ink";
import type { WorkflowConfig } from "../../workflow/config.js";
import type { WorkflowRun } from "../../state/types.js";

interface AutopilotViewProps {
  config: WorkflowConfig | undefined;
  runs: WorkflowRun[];
  autopilotRunning: boolean;
  stats: { lastPoll: string | null; activeCount: number; totalDispatched: number };
  height: number;
  eligibleIssues?: Array<{ number: number; title: string; labels: string[] }>;
  skippedIssues?: Array<{ number: number; title: string; reason: string }>;
}

const TERMINAL_STATUSES = new Set(["done", "failed", "escalated"]);

export function AutopilotView({ config, runs, autopilotRunning, stats, height, eligibleIssues, skippedIssues }: AutopilotViewProps) {
  const ap = config?.autopilot;

  const activeRuns = runs.filter((r) => !TERMINAL_STATUSES.has(r.status));
  const recentDone = runs.filter((r) => r.status === "done").slice(-5).reverse();
  const escalations = runs.filter((r) => r.status === "escalated");

  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1} height={height}>
      <Box justifyContent="space-between" flexShrink={0}>
        <Text bold color="cyan">Autopilot</Text>
        <Text dimColor>X toggle  Esc back  Q quit</Text>
      </Box>

      {/* Status badge */}
      <Box marginTop={1} flexShrink={0}>
        <Text dimColor>Status: </Text>
        {autopilotRunning ? (
          <Text bold color="green">RUNNING</Text>
        ) : (
          <Text bold color="red">STOPPED</Text>
        )}
        {stats.lastPoll && (
          <>
            <Text dimColor>  last poll: </Text>
            <Text>{stats.lastPoll.slice(11, 19)}</Text>
          </>
        )}
        <Text dimColor>  active: </Text>
        <Text bold>{stats.activeCount}</Text>
        <Text dimColor>  total dispatched: </Text>
        <Text bold>{stats.totalDispatched}</Text>
      </Box>

      {/* Config section */}
      {ap && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          marginTop={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Text bold>Configuration</Text>
          <Box flexDirection="row">
            <Text dimColor>poll interval:</Text>
            <Text> {ap.poll_interval_seconds}s</Text>
            <Text dimColor>  max concurrent:</Text>
            <Text> {ap.max_concurrent_runs}</Text>
          </Box>
          <Box flexDirection="row">
            <Text dimColor>eligible labels:</Text>
            <Text> [{ap.eligible_labels.join(", ")}]</Text>
          </Box>
          <Box flexDirection="row">
            <Text dimColor>exclude labels:</Text>
            <Text> [{ap.exclude_labels.join(", ")}]</Text>
          </Box>
          <Box flexDirection="row">
            <Text dimColor>priority labels:</Text>
            <Text> [{ap.priority_labels.join(", ")}]</Text>
          </Box>

          <Box marginTop={1}><Text bold>Risk Thresholds</Text></Box>
          <Box flexDirection="row">
            <Text dimColor>max_complexity:</Text>
            <Text> {ap.max_complexity}</Text>
            <Text dimColor>  min_gate_confidence:</Text>
            <Text> {ap.min_gate_confidence}</Text>
            <Text dimColor>  max_changed_files:</Text>
            <Text> {ap.max_changed_files}</Text>
          </Box>
        </Box>
      )}

      {/* Eligible Issues */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>Eligible Issues ({eligibleIssues?.length ?? 0})</Text>
        {!eligibleIssues || eligibleIssues.length === 0 ? (
          <Text dimColor>No eligible issues data — run autopilot to populate</Text>
        ) : (
          eligibleIssues.map((issue) => (
            <Box key={issue.number} flexDirection="row">
              <Text color="yellow">#{issue.number}</Text>
              <Text> {issue.title}</Text>
              {issue.labels.length > 0 && (
                <Text dimColor>  [{issue.labels.join(", ")}]</Text>
              )}
            </Box>
          ))
        )}
      </Box>

      {/* Skipped Issues */}
      {skippedIssues && skippedIssues.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          marginTop={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Text bold>Skipped Issues ({skippedIssues.length})</Text>
          {skippedIssues.map((issue) => (
            <Box key={issue.number} flexDirection="row">
              <Text color="yellow">#{issue.number}</Text>
              <Text> {issue.title}</Text>
              <Text dimColor> — {issue.reason}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Active Runs */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>Active Runs ({activeRuns.length})</Text>
        {activeRuns.length === 0 ? (
          <Text dimColor>No active runs</Text>
        ) : (
          activeRuns.map((r) => {
            const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
            return (
              <Box key={r.id} flexDirection="row">
                <Text color="yellow">#{r.issueNumber}</Text>
                <Text dimColor> {r.status}</Text>
                {r.currentPhase && <Text dimColor> ({r.currentPhase})</Text>}
                <Text> {title.length > 40 ? title.slice(0, 39) + "\u2026" : title}</Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Recent Completions */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>Recent Completions ({recentDone.length})</Text>
        {recentDone.length === 0 ? (
          <Text dimColor>No completed runs</Text>
        ) : (
          recentDone.map((r) => {
            const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
            return (
              <Box key={r.id} flexDirection="row">
                <Text color="green">#{r.issueNumber}</Text>
                <Text dimColor> done</Text>
                <Text> {title.length > 40 ? title.slice(0, 39) + "\u2026" : title}</Text>
                <Text dimColor>  {r.updatedAt.slice(11, 19)}</Text>
              </Box>
            );
          })
        )}
      </Box>

      {/* Escalations */}
      {escalations.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="red"
          marginTop={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Text bold color="red">Escalations ({escalations.length})</Text>
          {escalations.map((r) => {
            const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
            const reason = r.blockedReason ?? "unknown reason";
            return (
              <Box key={r.id} flexDirection="column">
                <Box flexDirection="row">
                  <Text color="red">#{r.issueNumber}</Text>
                  <Text> {title.length > 35 ? title.slice(0, 34) + "\u2026" : title}</Text>
                </Box>
                <Box paddingLeft={2}>
                  <Text dimColor>reason: {reason}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Controls */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>Controls</Text>
        <Box flexDirection="row">
          <Text bold color="cyan">  X</Text>
          <Text>  toggle autopilot on/off</Text>
        </Box>
        <Box flexDirection="row">
          <Text bold color="cyan">  Esc</Text>
          <Text>  back to dashboard</Text>
        </Box>
      </Box>
    </Box>
  );
}
