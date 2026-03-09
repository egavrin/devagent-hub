import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { Action } from "../action-registry.js";

export type PaletteCommand = string;

interface CommandPaletteProps {
  actions: Action[];
  onSubmit: (actionId: string) => void;
  onCancel: () => void;
}

export function CommandPalette({ actions, onSubmit, onCancel }: CommandPaletteProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (text: string) => {
    const trimmed = text.trim().toLowerCase();
    // Exact match by id or label
    const exact = actions.find(
      (a) => a.id === trimmed || a.label.toLowerCase() === trimmed,
    );
    if (exact) {
      onSubmit(exact.id);
      return;
    }
    // Otherwise take the first filtered match
    if (filtered.length > 0) {
      onSubmit(filtered[0].id);
    }
  };

  const filtered = value.trim()
    ? actions.filter((a) => {
        const q = value.trim().toLowerCase();
        return (
          a.id.includes(q) ||
          a.label.toLowerCase().includes(q) ||
          a.keywords.some((k) => k.includes(q))
        );
      })
    : actions;

  return (
    <Box
      borderStyle="double"
      borderColor="magenta"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      width={50}
    >
      <Text bold color="magenta">Commands</Text>

      <Box marginTop={1}>
        <Text color="yellow">{"> "}</Text>
        <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        {filtered.slice(0, 12).map((a) => (
          <Box key={a.id} justifyContent="space-between">
            <Text>{a.label}</Text>
            <Text dimColor>{a.hotkey}</Text>
          </Box>
        ))}
        {filtered.length === 0 && <Text dimColor>No matching commands</Text>}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Enter to run  Esc to close</Text>
      </Box>
    </Box>
  );
}
