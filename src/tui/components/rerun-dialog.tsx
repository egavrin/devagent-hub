import React from "react";
import { Box, Text, useInput } from "ink";

interface RerunDialogProps {
  profiles: string[];
  selectedIndex: number;
  onSelect: (profile: string) => void;
  onCancel: () => void;
}

export function RerunDialog({ profiles, selectedIndex, onSelect, onCancel }: RerunDialogProps) {
  const [localIndex, setLocalIndex] = React.useState(selectedIndex);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      const profile = profiles[localIndex];
      if (profile) onSelect(profile);
      return;
    }
    if (input === "j" || key.downArrow) {
      setLocalIndex((i) => Math.min(profiles.length - 1, i + 1));
    }
    if (input === "k" || key.upArrow) {
      setLocalIndex((i) => Math.max(0, i - 1));
    }
  });

  return (
    <Box
      borderStyle="double"
      borderColor="magenta"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      width={50}
    >
      <Text bold color="magenta">Rerun with Profile</Text>

      <Box flexDirection="column" marginTop={1}>
        {profiles.map((name, i) => (
          <Box key={name}>
            <Text color={i === localIndex ? "cyan" : undefined} bold={i === localIndex}>
              {i === localIndex ? "> " : "  "}{name}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>j/k navigate  Enter select  Esc cancel</Text>
      </Box>
    </Box>
  );
}
