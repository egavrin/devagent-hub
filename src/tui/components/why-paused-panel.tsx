import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun, Artifact, StatusTransition } from "../../state/types.js";

interface WhyPausedPanelProps {
  run: WorkflowRun;
  artifacts: Artifact[];
  transitions: StatusTransition[];
}

function getBlockedExplanation(
  run: WorkflowRun,
  artifacts: Artifact[],
  transitions: StatusTransition[],
): { reason: string; detail: string; suggestion: string; color: string } {
  const lastTransition = transitions.length > 0 ? transitions[transitions.length - 1] : null;

  switch (run.status) {
    case "failed": {
      const phase = run.currentPhase ?? "unknown";
      const failReason = lastTransition?.reason ?? "Unknown error";
      return {
        reason: `Failed at ${phase}`,
        detail: failReason,
        suggestion: "Press R to retry this phase, or D to delete and start over",
        color: "red",
      };
    }

    case "escalated": {
      const reason = lastTransition?.reason ?? "Escalated by policy";
      // Check for gate verdict
      const lastGate = [...artifacts].reverse().find((a) => a.type === "gate_verdict");
      const gateDetail = lastGate
        ? `Gate verdict: ${(lastGate.data as Record<string, unknown>).action} -- ${lastGate.summary}`
        : "";
      return {
        reason: "Escalated -- needs human intervention",
        detail: gateDetail || reason,
        suggestion: "Review the artifacts and decide: retry, rework, or close",
        color: "yellow",
      };
    }

    case "plan_draft":
    case "plan_revision": {
      return {
        reason: "Awaiting plan approval",
        detail: "The plan needs human review before implementation begins",
        suggestion: "Press A to approve, W to rework with feedback",
        color: "yellow",
      };
    }

    case "awaiting_human_review": {
      return {
        reason: "Awaiting human review",
        detail: "Auto-review passed. PR is ready for human review.",
        suggestion: "Review the PR, then press C to mark done",
        color: "cyan",
      };
    }

    case "auto_review_fix_loop": {
      const reviewReport = [...artifacts].reverse().find((a) => a.type === "review_report");
      const blocking = reviewReport
        ? (reviewReport.data as Record<string, unknown>).blockingCount as number ?? 0
        : 0;
      return {
        reason: `Auto-review found ${blocking} blocking issue(s)`,
        detail: reviewReport?.summary ?? "Review found issues that need fixing",
        suggestion: "Press C to run repair, or R to retry review",
        color: "magenta",
      };
    }

    default:
      return {
        reason: "",
        detail: "",
        suggestion: "",
        color: "white",
      };
  }
}

const NEEDS_EXPLANATION = new Set([
  "failed", "escalated", "plan_draft", "plan_revision",
  "awaiting_human_review", "auto_review_fix_loop",
]);

export function WhyPausedPanel({ run, artifacts, transitions }: WhyPausedPanelProps) {
  if (!NEEDS_EXPLANATION.has(run.status)) {
    return null;
  }

  const { reason, detail, suggestion, color } = getBlockedExplanation(run, artifacts, transitions);

  return (
    <Box
      borderStyle="single"
      borderColor={color}
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      flexShrink={0}
    >
      <Text bold color={color}>{reason}</Text>
      {detail && <Text>{detail}</Text>}
      {suggestion && <Text color="yellow">{suggestion}</Text>}
    </Box>
  );
}
