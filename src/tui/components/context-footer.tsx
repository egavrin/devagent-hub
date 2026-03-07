import React from "react";
import { Box, Text } from "ink";
import type { Screen, Dialog } from "../state.js";

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

function dashboardHints(autopilotRunning?: boolean): HintEntry[] {
  return [
    { key: "j/k", label: "nav" },
    { key: "h/l", label: "col" },
    { key: "Enter", label: "open" },
    { key: "N", label: "new" },
    { key: "V", label: "approvals" },
    { key: "C", label: "continue" },
    { key: "M", label: "runners" },
    { key: "U", label: "autopilot" },
    { key: "X", label: autopilotRunning ? "stop autopilot" : "autopilot" },
    { key: "Q", label: "quit" },
  ];
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
    { key: "Enter", label: "open run" },
  ];

  if (runStatus === "plan_draft" || runStatus === "plan_revision") {
    hints.push({ key: "A", label: "approve plan" });
    hints.push({ key: "W", label: "rework" });
  } else if (runStatus === "awaiting_human_review") {
    hints.push({ key: "A", label: "approve review" });
    hints.push({ key: "C", label: "mark reviewed" });
    hints.push({ key: "O", label: "open PR" });
  } else if (runStatus === "ready_to_merge") {
    hints.push({ key: "A", label: "mark done" });
    hints.push({ key: "O", label: "open PR" });
  } else if (runStatus === "failed") {
    hints.push({ key: "r", label: "retry" });
  } else if (runStatus === "escalated") {
    hints.push({ key: "T", label: "take-over" });
  } else {
    hints.push({ key: "A", label: "approve" });
    hints.push({ key: "W", label: "rework" });
  }

  hints.push({ key: "Esc", label: "back" });
  hints.push({ key: "Q", label: "quit" });
  return hints;
}

function runHints(status: string | null, hasActiveProcess: boolean): HintEntry[] {
  const hints: HintEntry[] = [
    { key: "Tab", label: "pane" },
    { key: "S/L/E", label: "log mode" },
    { key: "Esc", label: "back" },
  ];

  if (status === "plan_draft" || status === "plan_revision") {
    hints.push({ key: "A", label: "approve" });
    hints.push({ key: "W", label: "rework" });
  }

  if (status === "failed") {
    hints.push({ key: "R", label: "retry" });
  }

  const continuable = [
    "new", "triaged", "plan_draft", "plan_revision", "plan_accepted",
    "awaiting_local_verify", "draft_pr_opened", "auto_review_fix_loop",
    "awaiting_human_review", "ready_to_merge",
  ];
  if (status && continuable.includes(status)) {
    hints.push({ key: "C", label: "continue" });
  }

  if (hasActiveProcess) {
    hints.push({ key: "K", label: "kill" });
  }

  const terminal = ["done", "failed", "escalated"];
  if (status && !terminal.includes(status)) {
    hints.push({ key: "R", label: "rerun" });
    hints.push({ key: "E", label: "escalate" });
    hints.push({ key: "P", label: "pause" });
    hints.push({ key: "T", label: "take-over" });
  }
  hints.push({ key: "F", label: "diff" });
  hints.push({ key: "O", label: "open PR" });
  hints.push({ key: "Q", label: "quit" });
  return hints;
}

export function ContextFooter({ screen, dialog, inputMode, runStatus, hasActiveProcess, autopilotRunning }: ContextFooterProps) {
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
    hints = dashboardHints(autopilotRunning);
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
