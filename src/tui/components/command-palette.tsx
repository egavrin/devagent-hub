import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

export interface PaletteEntry {
  id: string;
  label: string;
  hint?: string;
  keywords: string[];
}

const BASE_COMMANDS: PaletteEntry[] = [
  { id: "approve", label: "Approve", hint: "A", keywords: ["approve", "accept", "ok"] },
  { id: "rework", label: "Rework with feedback", hint: "W", keywords: ["rework", "revise", "feedback"] },
  { id: "continue", label: "Continue to next phase", hint: "C", keywords: ["continue", "next", "proceed"] },
  { id: "retry", label: "Retry current phase", hint: "r", keywords: ["retry", "again", "redo"] },
  { id: "rerun", label: "Rerun with different profile", hint: "R", keywords: ["rerun", "profile", "switch"] },
  { id: "kill", label: "Kill running process", hint: "K", keywords: ["kill", "stop", "abort"] },
  { id: "pause", label: "Pause after current phase", hint: "P", keywords: ["pause", "hold", "wait"] },
  { id: "escalate", label: "Escalate to human", hint: "E", keywords: ["escalate", "human", "help"] },
  { id: "delete", label: "Delete run", hint: "D", keywords: ["delete", "remove", "drop"] },
  { id: "open-pr", label: "Open PR URL", hint: "O", keywords: ["open", "pr", "url", "browser"] },
  { id: "take-over", label: "Take over (show worktree)", hint: "T", keywords: ["take", "over", "worktree", "manual"] },
  { id: "filter", label: "Filter runs", hint: "/", keywords: ["filter", "search", "find"] },
  { id: "approvals", label: "View approval inbox", hint: "V", keywords: ["approvals", "inbox", "pending", "queue"] },
  { id: "runners", label: "View runners", hint: "M", keywords: ["runners", "agents", "machines"] },
  { id: "autopilot", label: "Toggle autopilot", hint: "X", keywords: ["autopilot", "auto", "daemon"] },
  { id: "settings", label: "Settings", hint: ",", keywords: ["settings", "config", "preferences"] },
  { id: "help", label: "Help", hint: "?", keywords: ["help", "keys", "shortcuts"] },
  { id: "errors", label: "Show errors only", keywords: ["errors", "log", "debug"] },
];

export type PaletteCommand = string;

interface CommandPaletteProps {
  onSubmit: (command: PaletteCommand) => void;
  onCancel: () => void;
  contextCommands?: PaletteEntry[];
}

export function CommandPalette({ onSubmit, onCancel, contextCommands }: CommandPaletteProps) {
  const [value, setValue] = useState("");

  const allCommands = [...(contextCommands ?? []), ...BASE_COMMANDS];

  const handleSubmit = (text: string) => {
    const trimmed = text.trim().toLowerCase();
    // Match by id or label
    const match = allCommands.find(
      (c) => c.id === trimmed || c.label.toLowerCase() === trimmed,
    );
    if (match) {
      onSubmit(match.id);
    } else if (filtered.length > 0) {
      onSubmit(filtered[0].id);
    }
  };

  const filtered = value.trim()
    ? allCommands.filter((c) => {
        const q = value.trim().toLowerCase();
        return (
          c.id.includes(q) ||
          c.label.toLowerCase().includes(q) ||
          c.keywords.some((k) => k.includes(q))
        );
      })
    : allCommands;

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
        {filtered.slice(0, 12).map((cmd) => (
          <Box key={cmd.id} justifyContent="space-between">
            <Text>{cmd.label}</Text>
            {cmd.hint && <Text dimColor>{cmd.hint}</Text>}
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
