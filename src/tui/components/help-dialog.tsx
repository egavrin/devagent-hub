import React from "react";
import { Box, Text } from "ink";

interface HelpDialogProps {
  onClose: () => void;
}

function Section({ title, bindings }: { title: string; bindings: [string, string][] }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold underline>{title}</Text>
      {bindings.map(([key, desc]) => (
        <Box key={key}>
          <Box width={16}>
            <Text color="cyan">{key}</Text>
          </Box>
          <Text>{desc}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  return (
    <Box
      borderStyle="double"
      borderColor="blue"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      width={60}
    >
      <Text bold color="blue">Keybindings</Text>

      <Box marginTop={1} flexDirection="column">
        <Section
          title="Navigation"
          bindings={[
            ["j/k or arrows", "Move up/down"],
            ["h/l or arrows", "Move left/right"],
            ["Enter", "Select / open run"],
            ["Tab / Shift+Tab", "Next / previous pane"],
            ["gg", "Go to top"],
            ["G", "Go to bottom"],
            ["1-5", "Pane shortcuts (run screen)"],
            ["Esc", "Back / close dialog"],
          ]}
        />

        <Section
          title="Run Actions"
          bindings={[
            ["a", "Approve plan"],
            ["w", "Rework plan"],
            ["c", "Continue workflow"],
            ["r", "Retry failed run"],
            ["K", "Kill active agent"],
            ["d", "Delete run"],
            ["n", "New run"],
            ["p", "Pause run"],
            ["t", "Take over (show worktree)"],
            ["o", "Open PR externally"],
          ]}
        />

        <Section
          title="Log Modes"
          bindings={[
            ["S", "Structured log view"],
            ["L", "Raw log view"],
          ]}
        />

        <Section
          title="Views and Tools"
          bindings={[
            ["/", "Toggle search/filter"],
            [":", "Command palette"],
            ["?", "This help screen"],
            ["v", "Approvals view"],
            ["f", "Toggle artifact diff"],
            ["x", "Toggle autopilot"],
            ["i", "Enter input mode"],
            ["q", "Quit"],
          ]}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Esc to close</Text>
      </Box>
    </Box>
  );
}
