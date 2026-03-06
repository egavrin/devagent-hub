import React from "react";
import { Box, Text } from "ink";
import type { OutputLine } from "../hooks/use-process-output.js";

interface RawLogViewProps {
  lines: OutputLine[];
  maxVisible?: number;
}

export function RawLogView({ lines, maxVisible = 50 }: RawLogViewProps) {
  const visible = lines.slice(-maxVisible);
  return (
    <Box flexDirection="column">
      {visible.map((line, i) => (
        <Text key={i} wrap="truncate">{line.text}</Text>
      ))}
      {visible.length === 0 && <Text dimColor>No output yet...</Text>}
    </Box>
  );
}
