import React from "react";
import { Box, Text } from "ink";
import type { WorkflowConfig } from "../../workflow/config.js";
import type { WorkflowRun, AgentRun } from "../../state/types.js";

const TERMINAL_STATUSES = new Set(["done", "failed", "escalated"]);

export interface RunnerInfo {
  bin: string;
  version: string | null;
  supportedPhases: string[];
  availableProviders: string[];
  supportedApprovalModes: string[];
  healthy: boolean;
}

interface RunnersViewProps {
  config: WorkflowConfig;
  runs?: WorkflowRun[];
  agentRuns?: AgentRun[];
  runnerInfos?: RunnerInfo[];
  height: number;
}

function formatAge(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86400_000) return `${Math.floor(ms / 3600_000)}h`;
  return `${Math.floor(ms / 86400_000)}d`;
}

export function RunnersView({ config, runs = [], agentRuns = [], runnerInfos = [], height }: RunnersViewProps) {
  const profiles = Object.entries(config.profiles);
  const roles = Object.entries(config.roles);
  const policy = config.selection_policy;

  // Count active runs per profile
  const activeRuns = runs.filter((r) => !TERMINAL_STATUSES.has(r.status));
  const runsByProfile = new Map<string, WorkflowRun[]>();
  for (const r of activeRuns) {
    if (r.agentProfile) {
      const list = runsByProfile.get(r.agentProfile) ?? [];
      list.push(r);
      runsByProfile.set(r.agentProfile, list);
    }
  }

  // Compute failure rates per profile from recent agent runs
  const recentAgentRuns = agentRuns.slice(-50);
  const failureByProfile = new Map<string, { total: number; failed: number }>();
  for (const ar of recentAgentRuns) {
    const p = ar.profile ?? "default";
    const entry = failureByProfile.get(p) ?? { total: 0, failed: 0 };
    entry.total++;
    if (ar.status === "failed" || ar.status === "timeout") entry.failed++;
    failureByProfile.set(p, entry);
  }

  // Latest agent run per profile for "last activity"
  const lastRunByProfile = new Map<string, AgentRun>();
  for (const ar of recentAgentRuns) {
    const p = ar.profile ?? "default";
    lastRunByProfile.set(p, ar);
  }

  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1} height={height}>
      <Box justifyContent="space-between" flexShrink={0}>
        <Text bold color="cyan">Runner Registry</Text>
        <Text dimColor>Esc back  Q quit</Text>
      </Box>

      {/* Live runners section */}
      {runnerInfos.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          marginTop={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Text bold>Live Runners ({runnerInfos.length})</Text>
          {runnerInfos.map((info) => (
            <Box key={info.bin} flexDirection="column" marginTop={0}>
              <Box>
                <Text bold color={info.healthy ? "green" : "red"}>
                  {info.healthy ? "●" : "○"} {info.bin}
                </Text>
                {info.version && <Text dimColor>  v{info.version}</Text>}
              </Box>
              <Box paddingLeft={2}>
                <Text dimColor>phases: </Text>
                <Text>{info.supportedPhases.join(", ") || "all"}</Text>
                {info.availableProviders.length > 0 && (
                  <>
                    <Text dimColor>  providers: </Text>
                    <Text>{info.availableProviders.join(", ")}</Text>
                  </>
                )}
                {info.supportedApprovalModes.length > 0 && (
                  <>
                    <Text dimColor>  approval: </Text>
                    <Text>{info.supportedApprovalModes.join(", ")}</Text>
                  </>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Profiles section */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>Profiles ({profiles.length})</Text>
        {profiles.map(([name, profile]) => {
          const count = runsByProfile.get(name)?.length ?? 0;
          const failure = failureByProfile.get(name);
          const lastRun = lastRunByProfile.get(name);
          const failRate = failure && failure.total > 0
            ? Math.round((failure.failed / failure.total) * 100)
            : null;

          return (
            <Box key={name} flexDirection="column" marginTop={0}>
              <Box>
                <Text bold color="green">{name}</Text>
                {count > 0 && <Text color="yellow"> ({count} active)</Text>}
                <Text dimColor>  bin:</Text>
                <Text> {profile.bin ?? "default"}</Text>
                <Text dimColor>  provider:</Text>
                <Text> {profile.provider ?? "default"}</Text>
                <Text dimColor>  model:</Text>
                <Text> {profile.model ?? "default"}</Text>
              </Box>
              <Box paddingLeft={2}>
                <Text dimColor>reasoning:</Text>
                <Text> {profile.reasoning ?? "default"}</Text>
                <Text dimColor>  approval:</Text>
                <Text> {profile.approval_mode ?? "default"}</Text>
                {profile.capabilities && profile.capabilities.length > 0 && (
                  <>
                    <Text dimColor>  caps:</Text>
                    <Text> [{profile.capabilities.join(", ")}]</Text>
                  </>
                )}
                {failRate !== null && (
                  <>
                    <Text dimColor>  fail:</Text>
                    <Text color={failRate > 30 ? "red" : failRate > 10 ? "yellow" : "green"}> {failRate}%</Text>
                    <Text dimColor> ({failure!.total} runs)</Text>
                  </>
                )}
                {lastRun && (
                  <>
                    <Text dimColor>  last:</Text>
                    <Text> {formatAge(lastRun.startedAt)} ago</Text>
                  </>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Current Assignments */}
      {runsByProfile.size > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          marginTop={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Text bold>Current Assignments</Text>
          {[...runsByProfile.entries()].map(([profileName, profileRuns]) => (
            <Box key={profileName} flexDirection="column">
              <Text bold color="green">  {profileName}:</Text>
              {profileRuns.map((r) => {
                const title = ((r.metadata as Record<string, unknown>)?.title as string) ?? "";
                return (
                  <Box key={r.id} paddingLeft={4}>
                    <Text>#{r.issueNumber}</Text>
                    <Text dimColor> {r.currentPhase ?? r.status}</Text>
                    <Text dimColor> {title.length > 25 ? title.slice(0, 24) + "\u2026" : title}</Text>
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      )}

      {/* Roles section */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>Roles (phase → profile)</Text>
        {roles.map(([phase, profile]) => (
          <Box key={phase} flexDirection="row">
            <Text dimColor>{phase}:</Text>
            <Text bold> {profile}</Text>
          </Box>
        ))}
      </Box>

      {/* Selection Policy section */}
      {policy && policy.rules.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          marginTop={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Text bold>Selection Policy ({policy.rules.length} rules)</Text>
          {policy.rules.map((rule, i) => (
            <Box key={i} flexDirection="row">
              <Text dimColor>phases:</Text>
              <Text> [{rule.phases.join(", ")}]</Text>
              {rule.complexity && (
                <>
                  <Text dimColor>  complexity:</Text>
                  <Text> [{rule.complexity.join(", ")}]</Text>
                </>
              )}
              <Text dimColor>  → </Text>
              <Text bold color="green">{rule.profile}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
