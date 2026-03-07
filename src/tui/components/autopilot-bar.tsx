import React from "react";
import { Box, Text } from "ink";

interface AutopilotBarProps {
  running: boolean;
  lastPoll: string | null;
  activeCount: number;
  totalDispatched: number;
}

export function AutopilotBar({ running, lastPoll, activeCount, totalDispatched }: AutopilotBarProps) {
  if (!running) return null;

  const pollAge = lastPoll
    ? `${Math.floor((Date.now() - new Date(lastPoll).getTime()) / 1000)}s ago`
    : "pending";

  return (
    <Box paddingLeft={1} flexShrink={0}>
      <Text color="magenta" bold>[AUTOPILOT] </Text>
      <Text color="green">active:{activeCount}</Text>
      <Text dimColor>  dispatched:{totalDispatched}  poll:{pollAge}</Text>
    </Box>
  );
}
