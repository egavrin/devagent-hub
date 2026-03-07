import React from "react";
import { Box, Text } from "ink";
import type { Screen } from "../state.js";

interface ContextFooterProps {
  screen: Screen;
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
    { key: "C", label: "continue" },
    { key: "A", label: "approve" },
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

  hints.push({ key: "Q", label: "quit" });
  return hints;
}

export function ContextFooter({ screen, inputMode, runStatus, hasActiveProcess }: ContextFooterProps) {
  if (inputMode) {
    return (
      <Box paddingLeft={1} flexShrink={0}>
        <Text dimColor>Type message, Enter send, Esc cancel</Text>
      </Box>
    );
  }

  const hints = screen === "run"
    ? runHints(runStatus ?? null, hasActiveProcess)
    : dashboardHints();

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
