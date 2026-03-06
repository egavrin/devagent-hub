import React from "react";
import { Box, Text } from "ink";
import type { AgentEvent } from "../event-parser.js";

interface StructuredViewProps {
  events: AgentEvent[];
  maxVisible?: number;
}

function eventIcon(type: AgentEvent["type"]): string {
  switch (type) {
    case "tool_call": return "*";
    case "tool_result": return "=";
    case "thinking": return "~";
    case "output": return ">>";
    case "error": return "!";
    default: return "?";
  }
}

function eventColor(type: AgentEvent["type"]): string {
  switch (type) {
    case "tool_call": return "cyan";
    case "tool_result": return "green";
    case "thinking": return "gray";
    case "output": return "white";
    case "error": return "red";
    default: return "gray";
  }
}

export function StructuredView({ events, maxVisible = 50 }: StructuredViewProps) {
  const visible = events.slice(-maxVisible);
  return (
    <Box flexDirection="column">
      {visible.map((event, i) => {
        const time = event.timestamp.split("T")[1]?.slice(0, 8) ?? "";
        const icon = eventIcon(event.type);
        const label = event.name ? `${event.type}:${event.name}` : event.type;
        const summary = event.summary ?? "";
        return (
          <Text key={i} color={eventColor(event.type)}>
            {time} {icon} {label} {summary}
          </Text>
        );
      })}
      {visible.length === 0 && <Text dimColor>No events yet...</Text>}
    </Box>
  );
}
