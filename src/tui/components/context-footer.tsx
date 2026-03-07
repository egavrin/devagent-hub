import React from "react";
import { Box, Text } from "ink";
import type { Screen, Dialog } from "../state.js";

interface ContextFooterProps {
  screen: Screen;
  dialog: Dialog;
  inputMode: boolean;
  runStatus?: string | null;
  hasActiveProcess: boolean;
}

interface HintEntry {
  key: string;
  label: string;
}

function dashboardHints(): HintEntry[] {
  return [
    { key: "j/k", label: "nav" },
    { key: "h/l", label: "col" },
    { key: "Enter", label: "open" },
    { key: "N", label: "new" },
    { key: "V", label: "approvals" },
    { key: "C", label: "continue" },
    { key: "Q", label: "quit" },
  ];
}

function approvalHints(): HintEntry[] {
  return [
    { key: "j/k", label: "nav" },
    { key: "Enter", label: "open run" },
    { key: "A", label: "approve" },
    { key: "W", label: "rework" },
    { key: "Esc", label: "back" },
    { key: "Q", label: "quit" },
  ];
}

function runHints(status: string | null, hasActiveProcess: boolean): HintEntry[] {
  const hints: HintEntry[] = [
    { key: "Tab", label: "pane" },
    { key: "S/L", label: "log mode" },
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
  ];
  if (status && continuable.includes(status)) {
    hints.push({ key: "C", label: "continue" });
  }

  if (hasActiveProcess) {
    hints.push({ key: "K", label: "kill" });
  }

  const terminal = ["done", "failed", "escalated"];
  if (status && !terminal.includes(status)) {
    hints.push({ key: "P", label: "pause" });
    hints.push({ key: "T", label: "take-over" });
  }
  hints.push({ key: "F", label: "diff" });
  hints.push({ key: "O", label: "open PR" });
  hints.push({ key: "Q", label: "quit" });
  return hints;
}

export function ContextFooter({ screen, dialog, inputMode, runStatus, hasActiveProcess }: ContextFooterProps) {
  if (inputMode || dialog) {
    return null;
  }

  let hints: HintEntry[];
  if (screen === "approvals") {
    hints = approvalHints();
  } else if (screen === "run") {
    hints = runHints(runStatus ?? null, hasActiveProcess);
  } else {
    hints = dashboardHints();
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
