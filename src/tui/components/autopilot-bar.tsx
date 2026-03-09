import React from "react";
import { Box, Text } from "ink";

interface AutopilotBarProps {
  running: boolean;
  lastPoll: string | null;
  activeCount: number;
  totalDispatched: number;
  escalatedCount?: number;
  maxEscalations?: number;
  totalCostUsd?: number;
  sessionMaxCostUsd?: number;
}

export function AutopilotBar({ running, lastPoll, activeCount, totalDispatched, escalatedCount, maxEscalations, totalCostUsd, sessionMaxCostUsd }: AutopilotBarProps) {
  if (!running) return null;

  const pollAge = lastPoll
    ? `${Math.floor((Date.now() - new Date(lastPoll).getTime()) / 1000)}s ago`
    : "pending";

  const escalationPressure = (maxEscalations && maxEscalations > 0 && escalatedCount !== undefined)
    ? escalatedCount / maxEscalations
    : 0;
  const costPressure = (sessionMaxCostUsd && sessionMaxCostUsd > 0 && totalCostUsd !== undefined)
    ? totalCostUsd / sessionMaxCostUsd
    : 0;
  const pressureColor = Math.max(escalationPressure, costPressure) >= 0.8 ? "red"
    : Math.max(escalationPressure, costPressure) >= 0.5 ? "yellow"
    : "green";

  return (
    <Box paddingLeft={1} flexShrink={0}>
      <Text color="magenta" bold>[AUTOPILOT] </Text>
      <Text color="green">active:{activeCount}</Text>
      <Text dimColor>  dispatched:{totalDispatched}  poll:{pollAge}</Text>
      {escalatedCount !== undefined && maxEscalations !== undefined && maxEscalations > 0 && (
        <Text color={pressureColor}>  esc:{escalatedCount}/{maxEscalations}</Text>
      )}
      {totalCostUsd !== undefined && totalCostUsd > 0 && (
        <Text color={pressureColor}>  cost:${totalCostUsd.toFixed(2)}{sessionMaxCostUsd && sessionMaxCostUsd > 0 ? `/$${sessionMaxCostUsd.toFixed(2)}` : ""}</Text>
      )}
    </Box>
  );
}
