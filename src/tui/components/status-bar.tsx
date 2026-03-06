import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  inputMode: boolean;
}

const NORMAL_HINTS = "j/k nav  h/l col  Tab pane  Enter select  A approve  R retry  K kill  I input  N new  Q quit  S struct  L raw";
const INPUT_HINTS = "Type message, Enter to send, Esc to cancel";

export function StatusBar({ inputMode }: StatusBarProps) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingLeft={1}>
      <Text dimColor>{inputMode ? INPUT_HINTS : NORMAL_HINTS}</Text>
    </Box>
  );
}
