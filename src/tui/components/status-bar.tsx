import React from "react";
import { Box, Text } from "ink";
import type { FocusPane } from "../state.js";

interface StatusBarProps {
  inputMode: boolean;
  focusPane: FocusPane;
}

const KANBAN_HINTS = "j/k nav  h/l col  Enter detail  C continue  A approve  R retry  N new  D delete  K kill  I input  Q quit";
const DETAIL_HINTS = "C continue  A approve  R retry  K kill  D delete  N new  I input  Esc back  Q quit";
const INPUT_HINTS = "Type message, Enter to send, Esc to cancel";

export function StatusBar({ inputMode, focusPane }: StatusBarProps) {
  let hints = KANBAN_HINTS;
  if (inputMode) hints = INPUT_HINTS;
  else if (focusPane !== "queue") hints = DETAIL_HINTS;

  return (
    <Box borderStyle="single" borderColor="gray" paddingLeft={1}>
      <Text dimColor>{hints}</Text>
    </Box>
  );
}
