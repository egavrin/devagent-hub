import React from "react";
import { Box, Text } from "ink";
import type { Screen, Dialog } from "../state.js";
import type { WorkflowStatus } from "../../state/types.js";
import { suggestedAction } from "../status-map.js";

interface ContextFooterProps {
  screen: Screen;
  dialog: Dialog;
  inputMode: boolean;
  runStatus?: string | null;
  hasActiveProcess: boolean;
  autopilotRunning?: boolean;
}

interface HintEntry {
  key: string;
  label: string;
}

function dashboardHints(runStatus?: string | null): HintEntry[] {
  const hints: HintEntry[] = [
    { key: "Enter", label: "open" },
    { key: "C", label: "continue" },
    { key: "N", label: "new" },
    { key: "V", label: "inbox" },
    { key: "/", label: "search" },
    { key: ".", label: "commands" },
    { key: "?", label: "help" },
  ];

  // Prepend suggested action for selected run
  if (runStatus) {
    const action = suggestedAction(runStatus as WorkflowStatus);
    if (action && !hints.some(h => h.key === action.key)) {
      hints.unshift({ key: action.key, label: action.label });
    }
  }

  return hints;
}

function runnersHints(): HintEntry[] {
  return [
    { key: "Esc", label: "back" },
    { key: "Q", label: "quit" },
  ];
}

function autopilotHints(): HintEntry[] {
  return [
    { key: "j/k", label: "nav" },
    { key: "Esc", label: "back" },
    { key: "X", label: "toggle" },
    { key: "Q", label: "quit" },
  ];
}

function settingsHints(): HintEntry[] {
  return [
    { key: "Esc", label: "back" },
    { key: "Q", label: "quit" },
  ];
}

function approvalHints(runStatus?: string | null): HintEntry[] {
  const hints: HintEntry[] = [
    { key: "j/k", label: "nav" },
    { key: "Enter", label: "open" },
  ];

  if (runStatus === "plan_draft" || runStatus === "plan_revision") {
    hints.push({ key: "A", label: "approve" });
    hints.push({ key: "W", label: "rework" });
  } else if (runStatus === "awaiting_human_review") {
    hints.push({ key: "A", label: "approve" });
    hints.push({ key: "r", label: "rerun" });
  } else if (runStatus === "ready_to_merge") {
    hints.push({ key: "A", label: "done" });
  } else if (runStatus === "failed") {
    hints.push({ key: "r", label: "retry" });
  } else if (runStatus === "escalated") {
    hints.push({ key: "T", label: "take-over" });
  } else {
    hints.push({ key: "A", label: "approve" });
  }

  hints.push({ key: "Esc", label: "back" });
  return hints;
}

function runHints(status: string | null, hasActiveProcess: boolean): HintEntry[] {
  const hints: HintEntry[] = [
    { key: "Tab", label: "pane" },
    { key: "Esc", label: "back" },
  ];

  // Suggested action first
  if (status) {
    const action = suggestedAction(status as WorkflowStatus);
    if (action) {
      hints.unshift({ key: action.key, label: action.label });
    }
  }

  if (hasActiveProcess) {
    hints.push({ key: "K", label: "kill" });
  }

  hints.push({ key: ".", label: "commands" });
  hints.push({ key: "?", label: "help" });
  return hints;
}

export function ContextFooter({ screen, dialog, inputMode, runStatus, hasActiveProcess }: ContextFooterProps) {
  if (inputMode || dialog) {
    return null;
  }

  let hints: HintEntry[];
  if (screen === "approvals") {
    hints = approvalHints(runStatus);
  } else if (screen === "run") {
    hints = runHints(runStatus ?? null, hasActiveProcess);
  } else if (screen === "runners") {
    hints = runnersHints();
  } else if (screen === "autopilot") {
    hints = autopilotHints();
  } else if (screen === "settings") {
    hints = settingsHints();
  } else {
    hints = dashboardHints(runStatus);
  }

  return (
    <Box paddingLeft={1} flexShrink={0}>
      {hints.map((h, i) => (
        <Text key={h.key}>
          {i > 0 ? "  " : ""}
          <Text color="gray">{h.key}</Text>
          <Text dimColor> {h.label}</Text>
        </Text>
      ))}
    </Box>
  );
}
