import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun } from "../../state/types.js";
import type { AgentEvent } from "../event-parser.js";
import type { OutputLine } from "../hooks/use-process-output.js";
import type { LogMode } from "../state.js";
import { StructuredView } from "./structured-view.js";
import { RawLogView } from "./raw-log-view.js";

interface LogPaneProps {
  selectedRun: WorkflowRun | null;
  logMode: LogMode;
  events: AgentEvent[];
  outputLines: OutputLine[];
  isFocused: boolean;
}

export function LogPane({ selectedRun, logMode, events, outputLines, isFocused }: LogPaneProps) {
  if (!selectedRun) {
    return (
      <Box borderStyle="single" borderColor="gray" flexDirection="column" flexGrow={1} padding={1}>
        <Text dimColor>Select a workflow run to view logs...</Text>
      </Box>
    );
  }

  const repoShort = selectedRun.repo.split("/").pop() ?? selectedRun.repo;
  const modeLabel = logMode === "structured" ? "[S]truct" : logMode === "errors" ? "[E]rrors" : "[L]og";

  const errorPattern = /error|fail/i;
  const errorEvents = events.filter(
    (ev) => ev.type === "error" || errorPattern.test(ev.summary ?? "") || errorPattern.test(ev.type),
  );

  return (
    <Box
      borderStyle={isFocused ? "bold" : "single"}
      borderColor={isFocused ? "blue" : "gray"}
      flexDirection="column"
      flexGrow={1}
      padding={1}
    >
      <Box justifyContent="space-between">
        <Text bold>
          {">"} #{selectedRun.issueNumber} {repoShort} -- {selectedRun.status}
        </Text>
        <Text dimColor>{modeLabel}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column" flexGrow={1}>
        {logMode === "structured" ? (
          <StructuredView events={events} />
        ) : logMode === "errors" ? (
          <Box flexDirection="column">
            <Text dimColor>Showing {errorEvents.length} errors of {events.length} total events</Text>
            <StructuredView events={errorEvents} />
          </Box>
        ) : (
          <RawLogView lines={outputLines} />
        )}
      </Box>
    </Box>
  );
}
