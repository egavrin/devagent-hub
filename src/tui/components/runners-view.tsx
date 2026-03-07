import React from "react";
import { Box, Text } from "ink";
import type { WorkflowConfig } from "../../workflow/config.js";
import type { WorkflowRun } from "../../state/types.js";

const TERMINAL_STATUSES = new Set(["done", "failed", "escalated"]);

interface RunnersViewProps {
  config: WorkflowConfig;
  runs?: WorkflowRun[];
  height: number;
  onSetDefault?: (profile: string) => void;
}

export function RunnersView({ config, runs = [], height }: RunnersViewProps) {
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

  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1} height={height}>
      <Box justifyContent="space-between" flexShrink={0}>
        <Text bold color="cyan">Runner Configuration</Text>
        <Text dimColor>Esc back  Q quit</Text>
      </Box>

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
          return (
          <Box key={name} flexDirection="row" marginTop={0}>
            <Text bold color="green">{name}</Text>
            {count > 0 && <Text color="yellow"> ({count} active)</Text>}
            <Text dimColor>  bin:</Text>
            <Text> {profile.bin ?? "default"}</Text>
            <Text dimColor>  provider:</Text>
            <Text> {profile.provider ?? "default"}</Text>
            <Text dimColor>  model:</Text>
            <Text> {profile.model ?? "default"}</Text>
            <Text dimColor>  reasoning:</Text>
            <Text> {profile.reasoning ?? "default"}</Text>
            <Text dimColor>  approval:</Text>
            <Text> {profile.approval_mode ?? "default"}</Text>
            {profile.capabilities && profile.capabilities.length > 0 && (
              <>
                <Text dimColor>  caps:</Text>
                <Text> [{profile.capabilities.join(", ")}]</Text>
              </>
            )}
          </Box>
          );
        })}
      </Box>

      {/* Current Load section */}
      {runsByProfile.size > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          marginTop={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Text bold>Current Load</Text>
          {[...runsByProfile.entries()].map(([profileName, profileRuns]) => (
            <Box key={profileName} flexDirection="row">
              <Text bold color="green">  {profileName}:</Text>
              <Text> {profileRuns.length} {profileRuns.length === 1 ? "run" : "runs"} ({profileRuns.map((r) => r.currentPhase ?? r.status).join(", ")})</Text>
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
        <Text bold>Roles (phase -&gt; profile)</Text>
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
              <Text dimColor>  -&gt; </Text>
              <Text bold color="green">{rule.profile}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
