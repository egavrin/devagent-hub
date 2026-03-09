import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { RunHeader } from "../tui/components/run-header.js";
import { RunCard } from "../tui/components/run-card.js";
import { ContextFooter } from "../tui/components/context-footer.js";
import { ArtifactPane } from "../tui/components/artifact-pane.js";
import { TimelinePane } from "../tui/components/timeline-pane.js";
import { WhyPausedPanel } from "../tui/components/why-paused-panel.js";
import { AutopilotBar } from "../tui/components/autopilot-bar.js";
import { ApprovalQueueView, resolveInboxItem } from "../tui/components/approval-queue-view.js";
import { NewRunDialog } from "../tui/components/new-run-dialog.js";
import { RunnersView } from "../tui/components/runners-view.js";
import type { RunnerInfo } from "../tui/components/runners-view.js";
import { defaultConfig } from "../workflow/config.js";
import type { WorkflowRun, Artifact, AgentRun, StatusTransition, ApprovalRequest } from "../state/types.js";

// ─── Test fixtures ──────────────────────────────────────────

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "run-1",
    issueNumber: 42,
    issueUrl: "https://github.com/test/repo/issues/42",
    repo: "test/repo",
    status: "implementing",
    sourceType: "issue",
    mode: "assisted",
    branch: "devagent/42",
    prNumber: null,
    prUrl: null,
    worktreePath: null,
    currentPhase: "implement",
    repairRound: 0,
    createdAt: new Date(Date.now() - 300_000).toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { title: "Fix login bug" },
    runnerId: null,
    agentProfile: null,
    blockedReason: null,
    nextAction: null,
    requestedModel: null,
    actualProvider: null,
    sourceRef: null,
    actualModel: null,
    ...overrides,
  };
}

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: "art-1",
    workflowRunId: "run-1",
    agentRunId: "agent-1",
    type: "triage_report",
    phase: "triage",
    summary: "Issue triaged successfully",
    data: { complexity: "small", summary: "Fix login bug" },
    filePath: null,
    createdAt: new Date().toISOString(),
    verdict: null,
    blockingCount: null,
    confidence: null,
    warningCount: null,
    riskLevel: null,
    ...overrides,
  };
}

function makeAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "agent-1",
    workflowRunId: "run-1",
    phase: "triage",
    status: "success",
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    finishedAt: new Date().toISOString(),
    inputPath: null,
    outputPath: null,
    eventsPath: null,
    iterations: 5,
    costUsd: null,
    runnerId: null,
    executorKind: null,
    profile: null,
    triggeredBy: null,
    stderrPath: null,
    stdoutPath: null,
    exitReason: null,
    ...overrides,
  };
}

function makeTransition(overrides: Partial<StatusTransition> = {}): StatusTransition {
  return {
    from: "new",
    to: "triaged",
    timestamp: new Date().toISOString(),
    reason: "Triage completed",
    artifactId: null,
    ...overrides,
  };
}

// ─── RunHeader ──────────────────────────────────────────────

describe("RunHeader render", () => {
  it("renders issue number and title", () => {
    const { lastFrame } = render(
      <RunHeader run={makeRun()} isActive={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("#42");
    expect(frame).toContain("Fix login bug");
  });

  it("renders status", () => {
    const { lastFrame } = render(
      <RunHeader run={makeRun({ status: "plan_draft" })} isActive={false} />,
    );
    expect(lastFrame()!).toContain("plan_draft");
  });

  it("shows RUNNING indicator when active", () => {
    const { lastFrame } = render(
      <RunHeader run={makeRun()} isActive={true} />,
    );
    expect(lastFrame()!).toContain("RUNNING");
  });

  it("shows repair round when > 0", () => {
    const { lastFrame } = render(
      <RunHeader run={makeRun({ repairRound: 2 })} isActive={false} />,
    );
    expect(lastFrame()!).toContain("2");
  });

  it("shows mode from run", () => {
    const { lastFrame } = render(
      <RunHeader run={makeRun({ mode: "watch" })} isActive={false} />,
    );
    expect(lastFrame()!).toContain("[WATCH]");
  });

  it("shows profile when set", () => {
    const { lastFrame } = render(
      <RunHeader run={makeRun({ agentProfile: "fast" })} isActive={false} />,
    );
    expect(lastFrame()!).toContain("Profile: fast");
  });

  it("shows runner when set", () => {
    const { lastFrame } = render(
      <RunHeader run={makeRun({ runnerId: "runner-alpha" })} isActive={false} />,
    );
    expect(lastFrame()!).toContain("Runner: runner-alpha");
  });

  it("renders gate verdicts", () => {
    const verdicts: Artifact[] = [
      makeArtifact({ id: "gate-1", type: "gate_verdict", phase: "triage", data: { action: "proceed", reason: "ok" } }),
      makeArtifact({ id: "gate-2", type: "gate_verdict", phase: "plan", data: { action: "block", reason: "bad" } }),
    ];
    const { lastFrame } = render(
      <RunHeader run={makeRun({ mode: "watch" })} isActive={false} gateVerdicts={verdicts} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("triage");
    expect(frame).toContain("plan");
  });

  it("shows urgent next-action hint for plan_draft", () => {
    const { lastFrame } = render(
      <RunHeader run={makeRun({ status: "plan_draft" })} isActive={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("approve");
    expect(frame).toContain("rework");
  });

  it("shows executor role from latest agent run", () => {
    const agentRun = makeAgentRun({ executorKind: "reviewer", profile: "strong" });
    const { lastFrame } = render(
      <RunHeader run={makeRun()} isActive={false} latestAgentRun={agentRun} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Role:");
    expect(frame).toContain("reviewer");
  });

  it("shows model when set", () => {
    const { lastFrame } = render(
      <RunHeader run={makeRun({ actualModel: "claude-opus-4-6" })} isActive={false} />,
    );
    expect(lastFrame()!).toContain("Model: claude-opus-4-6");
  });

  it("shows urgent hint for failed status", () => {
    const { lastFrame } = render(
      <RunHeader run={makeRun({ status: "failed" })} isActive={false} />,
    );
    expect(lastFrame()!).toContain("retry");
  });
});

// ─── RunCard ────────────────────────────────────────────────

describe("RunCard render", () => {
  it("renders issue number", () => {
    const { lastFrame } = render(
      <RunCard run={makeRun()} isSelected={false} isActive={false} />,
    );
    expect(lastFrame()!).toContain("#42");
  });

  it("renders without crashing when selected", () => {
    const { lastFrame } = render(
      <RunCard run={makeRun()} isSelected={true} isActive={false} />,
    );
    expect(lastFrame()!).toContain("#42");
  });

  it("shows blocked reason when set", () => {
    const { lastFrame } = render(
      <RunCard run={makeRun({ blockedReason: "Rate limit exceeded" })} isSelected={false} isActive={false} />,
    );
    expect(lastFrame()!).toContain("Rate limit exceeded");
  });

  it("shows human-readable status", () => {
    const { lastFrame } = render(
      <RunCard run={makeRun({ status: "plan_draft" })} isSelected={false} isActive={false} />,
    );
    expect(lastFrame()!).toContain("plan ready");
  });

  it("renders different statuses", () => {
    for (const status of ["new", "implementing", "done", "failed"] as const) {
      const { lastFrame } = render(
        <RunCard run={makeRun({ status })} isSelected={false} isActive={false} />,
      );
      expect(lastFrame()).toBeTruthy();
    }
  });
});

// ─── ContextFooter ──────────────────────────────────────────

describe("ContextFooter render", () => {
  it("renders dashboard hints", () => {
    const { lastFrame } = render(
      <ContextFooter screen="dashboard" dialog={null} inputMode={false} hasActiveProcess={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Enter");
    expect(frame).toContain("open");
    expect(frame).toContain("help");
  });

  it("renders approval hints with plan_draft status", () => {
    const { lastFrame } = render(
      <ContextFooter screen="approvals" dialog={null} inputMode={false} hasActiveProcess={false} runStatus="plan_draft" />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("approve");
    expect(frame).toContain("rework");
  });

  it("renders approval hints for awaiting_human_review", () => {
    const { lastFrame } = render(
      <ContextFooter screen="approvals" dialog={null} inputMode={false} hasActiveProcess={false} runStatus="awaiting_human_review" />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("approve");
    expect(frame).toContain("rerun");
  });

  it("renders approval hints for ready_to_merge", () => {
    const { lastFrame } = render(
      <ContextFooter screen="approvals" dialog={null} inputMode={false} hasActiveProcess={false} runStatus="ready_to_merge" />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("done");
  });

  it("renders approval hints for failed", () => {
    const { lastFrame } = render(
      <ContextFooter screen="approvals" dialog={null} inputMode={false} hasActiveProcess={false} runStatus="failed" />,
    );
    expect(lastFrame()!).toContain("retry");
  });

  it("renders approval hints for escalated", () => {
    const { lastFrame } = render(
      <ContextFooter screen="approvals" dialog={null} inputMode={false} hasActiveProcess={false} runStatus="escalated" />,
    );
    expect(lastFrame()!).toContain("take-over");
  });

  it("renders run hints with approve for plan_draft", () => {
    const { lastFrame } = render(
      <ContextFooter screen="run" dialog={null} inputMode={false} runStatus="plan_draft" hasActiveProcess={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Approve plan");
  });

  it("shows retry for failed runs", () => {
    const { lastFrame } = render(
      <ContextFooter screen="run" dialog={null} inputMode={false} runStatus="failed" hasActiveProcess={false} />,
    );
    expect(lastFrame()!).toContain("R");
    expect(lastFrame()!).toContain("Retry");
  });

  it("shows kill when process active", () => {
    const { lastFrame } = render(
      <ContextFooter screen="run" dialog={null} inputMode={false} runStatus="implementing" hasActiveProcess={true} />,
    );
    expect(lastFrame()!).toContain("K");
  });

  it("hides when dialog open", () => {
    const { lastFrame } = render(
      <ContextFooter screen="dashboard" dialog="new-run" inputMode={false} hasActiveProcess={false} />,
    );
    expect(lastFrame()!).toBe("");
  });

  it("hides when input mode", () => {
    const { lastFrame } = render(
      <ContextFooter screen="dashboard" dialog={null} inputMode={true} hasActiveProcess={false} />,
    );
    expect(lastFrame()!).toBe("");
  });

  it("shows autopilot hint on dashboard", () => {
    const { lastFrame } = render(
      <ContextFooter screen="dashboard" dialog={null} inputMode={false} hasActiveProcess={false} autopilotRunning={false} />,
    );
    expect(lastFrame()!).toContain("autopilot");
  });

  it("shows stop autopilot when running", () => {
    const { lastFrame } = render(
      <ContextFooter screen="dashboard" dialog={null} inputMode={false} hasActiveProcess={false} autopilotRunning={true} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("stop");
    expect(frame).toContain("X");
  });
});

// ─── ArtifactPane ───────────────────────────────────────────

describe("ArtifactPane render", () => {
  it("renders empty state", () => {
    const { lastFrame } = render(
      <ArtifactPane artifacts={[]} approvals={[]} isFocused={false} height={20} showDiff={false} />,
    );
    expect(lastFrame()!).toContain("No artifacts");
  });

  it("renders artifact summary", () => {
    const artifacts = [makeArtifact({ summary: "Issue triaged — small complexity" })];
    const { lastFrame } = render(
      <ArtifactPane artifacts={artifacts} approvals={[]} isFocused={false} height={20} showDiff={false} />,
    );
    expect(lastFrame()!).toContain("triaged");
  });

  it("renders review findings", () => {
    const artifacts = [
      makeArtifact({
        type: "review_report",
        phase: "review",
        summary: "2 blocking findings",
        data: {
          verdict: "block",
          blockingCount: 2,
          findings: [
            { file: "src/main.ts", line: 10, severity: "critical", message: "SQL injection", category: "security" },
          ],
        },
      }),
    ];
    const { lastFrame } = render(
      <ArtifactPane artifacts={artifacts} approvals={[]} isFocused={false} height={30} showDiff={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("BLOCK");
  });

  it("shows pending approval", () => {
    const artifacts = [makeArtifact({ type: "plan_draft", phase: "plan" })];
    const approvals: ApprovalRequest[] = [{
      id: "appr-1",
      workflowRunId: "run-1",
      phase: "plan",
      action: null,
      summary: "Plan needs review",
      reviewerComment: null,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
      severity: null,
      recommendedAction: null,
      requestedBy: null,
      reviewerRunId: null,
    }];
    const { lastFrame } = render(
      <ArtifactPane artifacts={artifacts} approvals={approvals} isFocused={false} height={20} showDiff={false} />,
    );
    expect(lastFrame()!).toContain("Pending Approvals");
  });

  it("shows executor attribution on latest artifact", () => {
    const artifacts = [makeArtifact({ agentRunId: "agent-1", summary: "Review completed" })];
    const agentRunsList = [makeAgentRun({ id: "agent-1", executorKind: "reviewer", profile: "strong" })];
    const { lastFrame } = render(
      <ArtifactPane artifacts={artifacts} approvals={[]} agentRuns={agentRunsList} isFocused={false} height={20} showDiff={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("reviewer");
    expect(frame).toContain("@strong");
  });

  it("shows executor kind in history items", () => {
    const artifacts = [
      makeArtifact({ id: "art-old", agentRunId: "agent-1", type: "triage_report", summary: "Triaged" }),
      makeArtifact({ id: "art-new", type: "plan_draft", summary: "Plan ready" }),
    ];
    const agentRunsList = [makeAgentRun({ id: "agent-1", executorKind: "executor" })];
    const { lastFrame } = render(
      <ArtifactPane artifacts={artifacts} approvals={[]} agentRuns={agentRunsList} isFocused={false} height={20} showDiff={false} />,
    );
    expect(lastFrame()!).toContain("[executor]");
  });
});

// ─── TimelinePane ───────────────────────────────────────────

describe("TimelinePane render", () => {
  it("renders empty state", () => {
    const { lastFrame } = render(
      <TimelinePane agentRuns={[]} transitions={[]} artifacts={[]} isFocused={false} height={20} />,
    );
    expect(lastFrame()!).toContain("No activity");
  });

  it("renders agent runs", () => {
    const agentRuns = [
      makeAgentRun({ phase: "triage", status: "success" }),
      makeAgentRun({ id: "agent-2", phase: "plan", status: "running", finishedAt: null }),
    ];
    const { lastFrame } = render(
      <TimelinePane agentRuns={agentRuns} transitions={[]} artifacts={[]} isFocused={false} height={20} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("triage");
    expect(frame).toContain("plan");
  });

  it("renders transitions", () => {
    const transitions = [
      makeTransition({ from: "new", to: "triaged", reason: "Triage done" }),
      makeTransition({ from: "triaged", to: "plan_draft", reason: "Plan created" }),
    ];
    const { lastFrame } = render(
      <TimelinePane agentRuns={[]} transitions={transitions} artifacts={[]} isFocused={false} height={20} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("triaged");
  });
});

// ─── WhyPausedPanel ─────────────────────────────────────────

describe("WhyPausedPanel render", () => {
  it("renders nothing for active statuses", () => {
    const { lastFrame } = render(
      <WhyPausedPanel run={makeRun({ status: "implementing" })} artifacts={[]} transitions={[]} />,
    );
    expect(lastFrame()!).toBe("");
  });

  it("renders for failed status", () => {
    const { lastFrame } = render(
      <WhyPausedPanel
        run={makeRun({ status: "failed", currentPhase: "implement" })}
        artifacts={[]}
        transitions={[makeTransition({ from: "implementing", to: "failed", reason: "Agent crashed" })]}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Failed at implement");
  });

  it("renders for plan_draft", () => {
    const { lastFrame } = render(
      <WhyPausedPanel
        run={makeRun({ status: "plan_draft" })}
        artifacts={[makeArtifact({ type: "plan_draft", phase: "plan", summary: "Implementation plan" })]}
        transitions={[]}
      />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("plan");
  });
});

// ─── AutopilotBar ───────────────────────────────────────────

describe("AutopilotBar render", () => {
  it("renders nothing when not running", () => {
    const { lastFrame } = render(
      <AutopilotBar running={false} lastPoll={null} activeCount={0} totalDispatched={0} />,
    );
    expect(lastFrame()!).toBe("");
  });

  it("renders status when running", () => {
    const { lastFrame } = render(
      <AutopilotBar running={true} lastPoll={new Date().toISOString()} activeCount={2} totalDispatched={5} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("AUTOPILOT");
    expect(frame).toContain("active:2");
    expect(frame).toContain("dispatched:5");
  });

  it("shows pending when no poll yet", () => {
    const { lastFrame } = render(
      <AutopilotBar running={true} lastPoll={null} activeCount={0} totalDispatched={0} />,
    );
    expect(lastFrame()!).toContain("pending");
  });
});

// ─── resolveInboxItem ──────────────────────────────────────

describe("resolveInboxItem", () => {
  const approvalItems = [
    { approval: { id: "a1", workflowRunId: "r1", phase: "plan", action: null, summary: "", reviewerComment: null, resolvedAt: null, createdAt: new Date().toISOString(), severity: null, recommendedAction: null, requestedBy: null, reviewerRunId: null } as ApprovalRequest, run: makeRun({ id: "r1" }) },
  ];
  const awaitingReview = [makeRun({ id: "r2", status: "awaiting_human_review" })];
  const readyToMerge = [makeRun({ id: "r3", status: "ready_to_merge" })];
  const escalated = [makeRun({ id: "r4", status: "escalated" })];
  const failed = [makeRun({ id: "r5", status: "failed" })];

  it("resolves approval item at index 0", () => {
    const item = resolveInboxItem(approvalItems, [], awaitingReview, readyToMerge, escalated, failed, 0);
    expect(item?.kind).toBe("approval");
    expect(item?.run?.id).toBe("r1");
    expect(item?.approval?.id).toBe("a1");
  });

  it("resolves awaiting_review item", () => {
    const item = resolveInboxItem(approvalItems, [], awaitingReview, readyToMerge, escalated, failed, 1);
    expect(item?.kind).toBe("awaiting_review");
    expect(item?.run?.id).toBe("r2");
  });

  it("resolves ready_to_merge item", () => {
    const item = resolveInboxItem(approvalItems, [], awaitingReview, readyToMerge, escalated, failed, 2);
    expect(item?.kind).toBe("ready_to_merge");
    expect(item?.run?.id).toBe("r3");
  });

  it("resolves escalated item", () => {
    const item = resolveInboxItem(approvalItems, [], awaitingReview, readyToMerge, escalated, failed, 3);
    expect(item?.kind).toBe("escalated");
    expect(item?.run?.id).toBe("r4");
  });

  it("resolves failed item", () => {
    const item = resolveInboxItem(approvalItems, [], awaitingReview, readyToMerge, escalated, failed, 4);
    expect(item?.kind).toBe("blocked");
    expect(item?.run?.id).toBe("r5");
  });

  it("returns null for out-of-bounds index", () => {
    const item = resolveInboxItem(approvalItems, [], awaitingReview, readyToMerge, escalated, failed, 99);
    expect(item).toBeNull();
  });

  it("works with empty sections", () => {
    const item = resolveInboxItem([], [], [], [makeRun({ id: "r3" })], [], [], 0);
    expect(item?.kind).toBe("ready_to_merge");
    expect(item?.run?.id).toBe("r3");
  });
});

// ─── ApprovalQueueView ─────────────────────────────────────

describe("ApprovalQueueView render", () => {
  it("renders empty state", () => {
    const { lastFrame } = render(
      <ApprovalQueueView planRevisionRuns={[]} items={[]} escalatedRuns={[]} failedRuns={[]} awaitingReviewRuns={[]} readyToMergeRuns={[]} selectedIndex={0} height={20} />,
    );
    expect(lastFrame()!).toContain("No pending items");
  });

  it("renders pending approvals section", () => {
    const items = [{
      approval: { id: "a1", workflowRunId: "r1", phase: "plan", action: null, summary: "Plan review", reviewerComment: null, resolvedAt: null, createdAt: new Date().toISOString(), severity: null, recommendedAction: null, requestedBy: null, reviewerRunId: null } as ApprovalRequest,
      run: makeRun({ id: "r1", status: "plan_draft" }),
    }];
    const { lastFrame } = render(
      <ApprovalQueueView planRevisionRuns={[]} items={items} escalatedRuns={[]} failedRuns={[]} awaitingReviewRuns={[]} readyToMergeRuns={[]} selectedIndex={0} height={20} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Pending Approvals");
    expect(frame).toContain("#42");
    expect(frame).toContain("plan");
  });

  it("renders awaiting human review section", () => {
    const reviewRuns = [makeRun({ id: "r2", status: "awaiting_human_review", prUrl: "https://github.com/test/repo/pull/10" })];
    const { lastFrame } = render(
      <ApprovalQueueView planRevisionRuns={[]} items={[]} escalatedRuns={[]} failedRuns={[]} awaitingReviewRuns={reviewRuns} readyToMergeRuns={[]} selectedIndex={0} height={20} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Awaiting Human Review");
    expect(frame).toContain("#42");
    expect(frame).toContain("mark reviewed");
  });

  it("renders ready to merge section", () => {
    const mergeRuns = [makeRun({ id: "r3", status: "ready_to_merge" })];
    const { lastFrame } = render(
      <ApprovalQueueView planRevisionRuns={[]} items={[]} escalatedRuns={[]} failedRuns={[]} awaitingReviewRuns={[]} readyToMergeRuns={mergeRuns} selectedIndex={0} height={20} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Ready to Merge");
    expect(frame).toContain("mark done");
  });

  it("renders escalated section separately from failed", () => {
    const escalated = [makeRun({ id: "r4", status: "escalated" })];
    const failed = [makeRun({ id: "r5", status: "failed" })];
    const { lastFrame } = render(
      <ApprovalQueueView planRevisionRuns={[]} items={[]} escalatedRuns={escalated} failedRuns={failed} awaitingReviewRuns={[]} readyToMergeRuns={[]} selectedIndex={0} height={30} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Escalated");
    expect(frame).toContain("Failed");
  });

  it("shows total item count", () => {
    const items = [{
      approval: { id: "a1", workflowRunId: "r1", phase: "plan", action: null, summary: "", reviewerComment: null, resolvedAt: null, createdAt: new Date().toISOString(), severity: null, recommendedAction: null, requestedBy: null, reviewerRunId: null } as ApprovalRequest,
      run: makeRun({ id: "r1" }),
    }];
    const reviewRuns = [makeRun({ id: "r2", status: "awaiting_human_review" })];
    const { lastFrame } = render(
      <ApprovalQueueView planRevisionRuns={[]} items={items} escalatedRuns={[]} failedRuns={[]} awaitingReviewRuns={reviewRuns} readyToMergeRuns={[]} selectedIndex={0} height={20} />,
    );
    expect(lastFrame()!).toContain("2 items");
  });

  it("shows mode badge for watch runs", () => {
    const reviewRuns = [makeRun({ id: "r2", status: "awaiting_human_review", mode: "watch" })];
    const { lastFrame } = render(
      <ApprovalQueueView planRevisionRuns={[]} items={[]} escalatedRuns={[]} failedRuns={[]} awaitingReviewRuns={reviewRuns} readyToMergeRuns={[]} selectedIndex={0} height={20} />,
    );
    expect(lastFrame()!).toContain("[W]");
  });
});

// ─── NewRunDialog ──────────────────────────────────────────

describe("NewRunDialog render", () => {
  const noop = () => {};
  const baseForm = { sourceType: "issue" as const, sourceId: "", mode: "assisted" as const, profile: "", runner: "", model: "", gateStrictness: "normal" as const, priority: "normal" as const };

  it("renders source type options including Brief", () => {
    const { lastFrame } = render(
      <NewRunDialog form={baseForm} profiles={[]} runners={[]} onChangeSourceType={noop} onChangeSourceId={noop} onChangeMode={noop} onChangeProfile={noop} onChangeRunner={noop} onChangeModel={noop} onChangeGateStrictness={noop} onChangePriority={noop} onSubmit={noop} onCancel={noop} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Issue");
    expect(frame).toContain("PR");
    expect(frame).toContain("Brief");
  });

  it("renders mode options including autopilot-once", () => {
    const { lastFrame } = render(
      <NewRunDialog form={baseForm} profiles={[]} runners={[]} onChangeSourceType={noop} onChangeSourceId={noop} onChangeMode={noop} onChangeProfile={noop} onChangeRunner={noop} onChangeModel={noop} onChangeGateStrictness={noop} onChangePriority={noop} onSubmit={noop} onCancel={noop} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Assisted");
    expect(frame).toContain("Watch");
    expect(frame).toContain("Auto-once");
  });

  it("shows profiles when available", () => {
    const { lastFrame } = render(
      <NewRunDialog form={baseForm} profiles={["fast", "strong"]} runners={[]} onChangeSourceType={noop} onChangeSourceId={noop} onChangeMode={noop} onChangeProfile={noop} onChangeRunner={noop} onChangeModel={noop} onChangeGateStrictness={noop} onChangePriority={noop} onSubmit={noop} onCancel={noop} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("fast");
    expect(frame).toContain("strong");
    expect(frame).toContain("default");
  });

  it("shows runner selection when multiple runners", () => {
    const { lastFrame } = render(
      <NewRunDialog form={baseForm} profiles={[]} runners={["devagent", "claude"]} onChangeSourceType={noop} onChangeSourceId={noop} onChangeMode={noop} onChangeProfile={noop} onChangeRunner={noop} onChangeModel={noop} onChangeGateStrictness={noop} onChangePriority={noop} onSubmit={noop} onCancel={noop} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Runner");
    expect(frame).toContain("devagent");
    expect(frame).toContain("claude");
  });

  it("hides runner selection with single runner", () => {
    const { lastFrame } = render(
      <NewRunDialog form={baseForm} profiles={[]} runners={["devagent"]} onChangeSourceType={noop} onChangeSourceId={noop} onChangeMode={noop} onChangeProfile={noop} onChangeRunner={noop} onChangeModel={noop} onChangeGateStrictness={noop} onChangePriority={noop} onSubmit={noop} onCancel={noop} />,
    );
    expect(lastFrame()!).not.toContain("Runner");
  });

  it("shows model override field", () => {
    const { lastFrame } = render(
      <NewRunDialog form={baseForm} profiles={[]} runners={[]} onChangeSourceType={noop} onChangeSourceId={noop} onChangeMode={noop} onChangeProfile={noop} onChangeRunner={noop} onChangeModel={noop} onChangeGateStrictness={noop} onChangePriority={noop} onSubmit={noop} onCancel={noop} />,
    );
    expect(lastFrame()!).toContain("Model");
  });
});

// ─── RunnersView ───────────────────────────────────────────

describe("RunnersView render", () => {
  const config = defaultConfig();

  it("renders profile list", () => {
    const { lastFrame } = render(
      <RunnersView config={config} height={30} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Profiles");
    expect(frame).toContain("default");
  });

  it("renders roles section", () => {
    const { lastFrame } = render(
      <RunnersView config={config} height={30} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Roles");
    expect(frame).toContain("triage");
    expect(frame).toContain("implement");
  });

  it("renders live runners when provided", () => {
    const infos: RunnerInfo[] = [
      { bin: "claude", version: "2.1", supportedPhases: ["triage", "plan"], availableProviders: ["anthropic"], supportedApprovalModes: ["full-auto"], mcpServers: [], tools: [], healthy: true },
      { bin: "devagent", version: null, supportedPhases: [], availableProviders: [], supportedApprovalModes: [], mcpServers: [], tools: [], healthy: false },
    ];
    const { lastFrame } = render(
      <RunnersView config={config} runnerInfos={infos} height={30} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Live Runners");
    expect(frame).toContain("claude");
    expect(frame).toContain("v2.1");
    expect(frame).toContain("anthropic");
  });

  it("shows current assignments", () => {
    const runs = [makeRun({ agentProfile: "default", status: "implementing", currentPhase: "implement" })];
    const { lastFrame } = render(
      <RunnersView config={config} runs={runs} height={30} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Current Assignments");
    expect(frame).toContain("#42");
  });

  it("shows failure rates from agent runs", () => {
    const agentRunsList = [
      makeAgentRun({ profile: "default", status: "success" }),
      makeAgentRun({ id: "a2", profile: "default", status: "failed" }),
      makeAgentRun({ id: "a3", profile: "default", status: "success" }),
    ];
    const { lastFrame } = render(
      <RunnersView config={config} agentRuns={agentRunsList} height={30} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("fail");
    expect(frame).toContain("33%");
  });
});

// ─── Gap coverage tests ─────────────────────────────────────

describe("resolveInboxItem with planRevisionRuns", () => {
  const approvalItems = [
    { approval: { id: "a1", workflowRunId: "r1", phase: "plan", action: null, summary: "", reviewerComment: null, resolvedAt: null, createdAt: new Date().toISOString(), severity: null, recommendedAction: null, requestedBy: null, reviewerRunId: null } as ApprovalRequest, run: makeRun({ id: "r1" }) },
  ];
  const planRevision = [makeRun({ id: "r-rev", status: "plan_revision" as any })];

  it("resolves plan_revision item after approvals", () => {
    const item = resolveInboxItem(approvalItems, planRevision, [], [], [], [], 1);
    expect(item?.kind).toBe("plan_revision");
    expect(item?.run?.id).toBe("r-rev");
  });

  it("shifts subsequent section indexes", () => {
    const awaitingReview = [makeRun({ id: "r2", status: "awaiting_human_review" })];
    const item = resolveInboxItem(approvalItems, planRevision, awaitingReview, [], [], [], 2);
    expect(item?.kind).toBe("awaiting_review");
    expect(item?.run?.id).toBe("r2");
  });
});

describe("ApprovalQueueView plan revision section", () => {
  it("renders Pending Reworks section", () => {
    const revisionRuns = [makeRun({ id: "r-rev", status: "plan_revision" as any })];
    const { lastFrame } = render(
      <ApprovalQueueView planRevisionRuns={revisionRuns} items={[]} escalatedRuns={[]} failedRuns={[]} awaitingReviewRuns={[]} readyToMergeRuns={[]} selectedIndex={0} height={20} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Pending Reworks");
    expect(frame).toContain("#42");
  });

  it("shows near-merge summary when PRs exist", () => {
    const reviewRuns = [makeRun({ id: "r2", status: "awaiting_human_review", prUrl: "https://github.com/test/repo/pull/10" })];
    const { lastFrame } = render(
      <ApprovalQueueView planRevisionRuns={[]} items={[]} escalatedRuns={[]} failedRuns={[]} awaitingReviewRuns={reviewRuns} readyToMergeRuns={[]} selectedIndex={0} height={20} />,
    );
    expect(lastFrame()!).toContain("Near-Merge PRs: 1");
  });
});

describe("NewRunDialog gate strictness and priority", () => {
  const noop = () => {};
  const form = { sourceType: "issue" as const, sourceId: "", mode: "assisted" as const, profile: "", runner: "", model: "", gateStrictness: "normal" as const, priority: "normal" as const };

  it("renders gate strictness options", () => {
    const { lastFrame } = render(
      <NewRunDialog form={form} profiles={[]} runners={[]} onChangeSourceType={noop} onChangeSourceId={noop} onChangeMode={noop} onChangeProfile={noop} onChangeRunner={noop} onChangeModel={noop} onChangeGateStrictness={noop} onChangePriority={noop} onSubmit={noop} onCancel={noop} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Gate:");
    expect(frame).toContain("normal");
    expect(frame).toContain("strict");
    expect(frame).toContain("lenient");
  });

  it("renders priority options", () => {
    const { lastFrame } = render(
      <NewRunDialog form={form} profiles={[]} runners={[]} onChangeSourceType={noop} onChangeSourceId={noop} onChangeMode={noop} onChangeProfile={noop} onChangeRunner={noop} onChangeModel={noop} onChangeGateStrictness={noop} onChangePriority={noop} onSubmit={noop} onCancel={noop} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("Priority:");
    expect(frame).toContain("high");
    expect(frame).toContain("urgent");
  });
});

describe("context footer rerun reviewer hint", () => {
  it("shows rerun reviewer for awaiting_human_review on approvals screen", () => {
    const { lastFrame } = render(
      <ContextFooter screen="approvals" dialog={null} inputMode={false} hasActiveProcess={false} runStatus="awaiting_human_review" />,
    );
    expect(lastFrame()!).toContain("rerun review");
  });
});

describe("context footer jump hints on run screen", () => {
  it("shows jump hints for run screen", () => {
    const { lastFrame } = render(
      <ContextFooter screen="run" dialog={null} inputMode={false} runStatus="implementing" hasActiveProcess={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("ga");
    expect(frame).toContain("gg");
    expect(frame).toContain("ge");
  });
});

describe("RunnersView MCP and tools display", () => {
  it("shows MCP servers and tools when present", () => {
    const infos: RunnerInfo[] = [
      { bin: "claude", version: "2.1", supportedPhases: ["triage"], availableProviders: ["anthropic"], supportedApprovalModes: [], mcpServers: ["filesystem", "github"], tools: ["bash", "edit"], healthy: true },
    ];
    const { lastFrame } = render(
      <RunnersView config={defaultConfig()} runnerInfos={infos} height={30} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("mcp:");
    expect(frame).toContain("filesystem");
    expect(frame).toContain("tools:");
    expect(frame).toContain("bash");
  });
});
