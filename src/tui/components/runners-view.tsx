import React from "react";
import { Box, Text } from "ink";
import type { WorkflowConfig } from "../../workflow/config.js";

interface RunnersViewProps {
  config: WorkflowConfig;
  height: number;
}

export function RunnersView({ config, height }: RunnersViewProps) {
  const profiles = Object.entries(config.profiles);
  const roles = Object.entries(config.roles);
  const policy = config.selection_policy;

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
        {profiles.map(([name, profile]) => (
          <Box key={name} flexDirection="row" marginTop={0}>
            <Text bold color="green">{name}</Text>
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
        ))}
      </Box>

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
