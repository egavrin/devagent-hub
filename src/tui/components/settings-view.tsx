import React from "react";
import { Box, Text } from "ink";
import type { WorkflowConfig } from "../../workflow/config.js";

interface SettingsViewProps {
  config: WorkflowConfig;
  height: number;
}

export function SettingsView({ config, height }: SettingsViewProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1} height={height}>
      <Box justifyContent="space-between" flexShrink={0}>
        <Text bold color="cyan">Settings</Text>
        <Text dimColor>Esc back  Q quit</Text>
      </Box>

      {/* General */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>General</Text>
        <Box><Text dimColor>version: </Text><Text>{config.version}</Text></Box>
        <Box><Text dimColor>mode: </Text><Text>{config.mode}</Text></Box>
        <Box><Text dimColor>max_concurrency: </Text><Text>{config.dispatch.max_concurrency}</Text></Box>
      </Box>

      {/* Workspace */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>Workspace</Text>
        <Box><Text dimColor>mode: </Text><Text>{config.workspace.mode}</Text></Box>
        <Box><Text dimColor>root: </Text><Text>{config.workspace.root}</Text></Box>
      </Box>

      {/* Runner Defaults */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>Runner Defaults</Text>
        <Box><Text dimColor>bin: </Text><Text>{config.runner.bin ?? "default"}</Text></Box>
        <Box><Text dimColor>approval_mode: </Text><Text>{config.runner.approval_mode}</Text></Box>
        <Box><Text dimColor>max_iterations: </Text><Text>{config.runner.max_iterations}</Text></Box>
        <Box><Text dimColor>provider: </Text><Text>{config.runner.provider ?? "default"}</Text></Box>
        <Box><Text dimColor>model: </Text><Text>{config.runner.model ?? "default"}</Text></Box>
        <Box><Text dimColor>reasoning: </Text><Text>{config.runner.reasoning ?? "default"}</Text></Box>
      </Box>

      {/* Verify */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>Verify Commands</Text>
        {config.verify.commands.map((cmd, i) => (
          <Box key={i}><Text>  {cmd}</Text></Box>
        ))}
      </Box>

      {/* PR */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>PR Settings</Text>
        <Box><Text dimColor>draft: </Text><Text>{String(config.pr.draft)}</Text></Box>
        <Box><Text dimColor>open_requires: </Text><Text>[{config.pr.open_requires.join(", ")}]</Text></Box>
      </Box>

      {/* Repair */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>Repair</Text>
        <Box><Text dimColor>max_rounds: </Text><Text>{config.repair.max_rounds}</Text></Box>
      </Box>

      {/* Handoff */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        marginTop={1}
        paddingLeft={1}
        paddingRight={1}
      >
        <Text bold>Handoff Conditions</Text>
        <Box><Text dimColor>when: </Text><Text>[{config.handoff.when.join(", ")}]</Text></Box>
      </Box>
    </Box>
  );
}
