import React from "react";
import { Box, Text } from "ink";
import type { Dialog } from "../state.js";
import type { Action } from "../action-registry.js";

interface ContextFooterProps {
  dialog: Dialog;
  inputMode: boolean;
  actions: Action[];
  suggested: Action | null;
}

/** Max hints to show in footer — keeps it scannable */
const MAX_HINTS = 8;

export function ContextFooter({ dialog, inputMode, actions, suggested }: ContextFooterProps) {
  if (inputMode || dialog) {
    return null;
  }

  // Build hint list: suggested first (if any), then available actions, capped
  const hints: { key: string; label: string; isSuggested: boolean }[] = [];
  const seen = new Set<string>();

  if (suggested) {
    hints.push({ key: suggested.hotkey, label: suggested.label, isSuggested: true });
    seen.add(suggested.id);
  }

  for (const action of actions) {
    if (seen.has(action.id)) continue;
    if (hints.length >= MAX_HINTS) break;
    hints.push({ key: action.hotkey, label: action.label, isSuggested: false });
    seen.add(action.id);
  }

  return (
    <Box paddingLeft={1} flexShrink={0}>
      {hints.map((h, i) => (
        <Text key={i}>
          {i > 0 ? "  " : ""}
          <Text color={h.isSuggested ? "yellow" : "gray"} bold={h.isSuggested}>{h.key}</Text>
          <Text dimColor={!h.isSuggested}> {h.label}</Text>
        </Text>
      ))}
    </Box>
  );
}
