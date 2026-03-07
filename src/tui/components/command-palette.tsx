import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

const COMMANDS = [
  "approve",
  "rework",
  "retry",
  "kill",
  "pause",
  "continue",
  "filter",
  "help",
] as const;

export type PaletteCommand = (typeof COMMANDS)[number];

interface CommandPaletteProps {
  onSubmit: (command: PaletteCommand) => void;
  onCancel: () => void;
}

export function CommandPalette({ onSubmit, onCancel }: CommandPaletteProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (text: string) => {
    const trimmed = text.trim().toLowerCase();
    const match = COMMANDS.find((c) => c === trimmed);
    if (match) {
      onSubmit(match);
    }
  };

  const filtered = value.trim()
    ? COMMANDS.filter((c) => c.startsWith(value.trim().toLowerCase()))
    : COMMANDS;

  return (
    <Box
      borderStyle="double"
      borderColor="magenta"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      width={50}
    >
      <Text bold color="magenta">Command Palette</Text>

      <Box marginTop={1}>
        <Text>: </Text>
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        {filtered.map((cmd) => (
          <Text key={cmd} dimColor>  {cmd}</Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Enter to run  Esc to close</Text>
      </Box>
    </Box>
  );
}
