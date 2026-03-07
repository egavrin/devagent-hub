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

  it("shows agent profile tag", () => {
    const { lastFrame } = render(
      <RunCard run={makeRun({ agentProfile: "fast" })} isSelected={false} isActive={false} />,
    );
    expect(lastFrame()!).toContain("fast");
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
    expect(frame).toContain("j/k");
    expect(frame).toContain("Enter");
    expect(frame).toContain("Q");
  });

  it("renders approval hints", () => {
    const { lastFrame } = render(
      <ContextFooter screen="approvals" dialog={null} inputMode={false} hasActiveProcess={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("approve");
    expect(frame).toContain("rework");
  });

  it("renders run hints with approve for plan_draft", () => {
    const { lastFrame } = render(
      <ContextFooter screen="run" dialog={null} inputMode={false} runStatus="plan_draft" hasActiveProcess={false} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain("approv");
    expect(frame).toContain("rewor");
  });

  it("shows retry for failed runs", () => {
    const { lastFrame } = render(
      <ContextFooter screen="run" dialog={null} inputMode={false} runStatus="failed" hasActiveProcess={false} />,
    );
    expect(lastFrame()!).toContain("retry");
  });

  it("shows kill when process active", () => {
    const { lastFrame } = render(
      <ContextFooter screen="run" dialog={null} inputMode={false} runStatus="implementing" hasActiveProcess={true} />,
    );
    expect(lastFrame()!).toContain("kill");
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
