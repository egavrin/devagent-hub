import React from "react";
import { Box, Text } from "ink";
import type { FocusPane } from "../hooks/use-keybindings.js";

interface StatusBarProps {
  inputMode: boolean;
  focusPane: FocusPane;
}

const KANBAN_HINTS = "j/k nav  h/l col  Tab next  Enter detail  Q quit";
const DETAIL_HINTS = "D delete  A approve  R retry  K kill  Tab logs  Esc back  Q quit";
const LOG_HINTS = "S struct  L raw  I input  Tab kanban  Esc back  Q quit";
const INPUT_HINTS = "Type message, Enter to send, Esc to cancel";

export function StatusBar({ inputMode, focusPane }: StatusBarProps) {
  let hints = KANBAN_HINTS;
  if (inputMode) hints = INPUT_HINTS;
  else if (focusPane === "detail") hints = DETAIL_HINTS;
  else if (focusPane === "logs") hints = LOG_HINTS;

  return (
    <Box borderStyle="single" borderColor="gray" paddingLeft={1}>
      <Text dimColor>{hints}</Text>
    </Box>
  );
}
