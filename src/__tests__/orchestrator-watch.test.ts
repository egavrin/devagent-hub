import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import { StateStore } from "../state/store.js";
import { MockGitHubGateway } from "../github/mock-gateway.js";
import { MockRunLauncher } from "../runner/mock-launcher.js";
import { defaultConfig } from "../workflow/config.js";
import { unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { GitHubIssue } from "../github/types.js";
import type { ReviewGate, GateVerdict, GateContext } from "../workflow/review-gate.js";

function makeIssue(n: number): GitHubIssue {
  return {
    number: n, title: `Issue ${n}: Watch test`, body: "Description",
    labels: ["da:ready"], url: `https://github.com/org/repo/issues/${n}`,
    state: "open", author: "user", createdAt: new Date().toISOString(), comments: [],
  };
}

class MockReviewGate implements ReviewGate {
  verdicts: Map<string, GateVerdict> = new Map();
  calls: Array<{ phase: string; output: Record<string, unknown>; context: GateContext }> = [];

  setVerdict(phase: string, verdict: GateVerdict): void {
    this.verdicts.set(phase, verdict);
  }

  async evaluate(phase: string, output: Record<string, unknown>, context: GateContext): Promise<GateVerdict> {
    this.calls.push({ phase, output, context });
    return this.verdicts.get(phase) ?? { action: "proceed", reason: "Default pass" };
  }
}

describe("WorkflowOrchestrator — watch mode", () => {
  let store: StateStore;
  let github: MockGitHubGateway;
  let launcher: MockRunLauncher;
  let gate: MockReviewGate;
  let orchestrator: WorkflowOrchestrator;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `hub-watch-test-${Date.now()}.db`);
    store = new StateStore(dbPath);
    github = new MockGitHubGateway();
    launcher = new MockRunLauncher();
    gate = new MockReviewGate();
    const config = { ...defaultConfig(), mode: "watch" as const };
    orchestrator = new WorkflowOrchestrator({
      store, github, launcher, repo: "org/repo", config, reviewGate: gate,
    });
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("auto-approves plan when gate passes in watch mode", async () => {
    github.seedIssue("org/repo", makeIssue(200));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "Small bug" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Fix file.ts" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Fixed" } });
    launcher.setResponse("verify", {
      exitCode: 0,
      output: { result: { allPassed: true }, summary: "Pass" },
    });
    launcher.setResponse("review", {
      exitCode: 0,
      output: { verdict: "pass", blockingCount: 0, summary: "Clean" },
    });

    gate.setVerdict("triage", { action: "proceed", reason: "Triage OK" });
    gate.setVerdict("plan", { action: "proceed", reason: "Plan OK" });
    gate.setVerdict("implement", { action: "proceed", reason: "Impl OK" });
    gate.setVerdict("verify", { action: "proceed", reason: "Verify OK" });

    const run = await orchestrator.runWorkflow(200);

    // In watch mode, should proceed all the way through to done (auto-ready PR)
    expect(run.status).toBe("done");

    // Gate should have been called for triage, plan, implement, and verify
    const gatePhases = gate.calls.map((c) => c.phase);
    expect(gatePhases).toContain("triage");
    expect(gatePhases).toContain("plan");
    expect(gatePhases).toContain("implement");
    expect(gatePhases).toContain("verify");

    // Should have gate_verdict artifacts
    const artifacts = store.getArtifactsByWorkflow(run.id);
    const gateArtifacts = artifacts.filter((a) => a.type === "gate_verdict");
    expect(gateArtifacts.length).toBe(4);
  });

  it("stops and escalates when triage gate rejects", async () => {
    github.seedIssue("org/repo", makeIssue(201));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "Vague issue" } });

    gate.setVerdict("triage", { action: "escalate", reason: "Issue too vague for automated processing" });

    const run = await orchestrator.runWorkflow(201);

    expect(run.status).toBe("escalated");
    const gateArtifacts = store.getArtifactsByWorkflow(run.id).filter((a) => a.type === "gate_verdict");
    expect(gateArtifacts).toHaveLength(1);
    expect(gateArtifacts[0].summary).toContain("too vague");
  });

  it("reworks plan when gate requests rework", async () => {
    github.seedIssue("org/repo", makeIssue(202));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    gate.setVerdict("triage", { action: "proceed", reason: "OK" });

    // First plan gets reworked, second plan passes
    let planCallCount = 0;
    const origLaunch = launcher.launch.bind(launcher);
    launcher.launch = (params: any) => {
      if (params.phase === "plan") {
        planCallCount++;
      }
      return origLaunch(params);
    };
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan v1" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Done" } });
    launcher.setResponse("verify", {
      exitCode: 0,
      output: { result: { allPassed: true }, summary: "Pass" },
    });
    launcher.setResponse("review", {
      exitCode: 0,
      output: { verdict: "pass", blockingCount: 0, summary: "Clean" },
    });

    let planGateCallCount = 0;
    const origEvaluate = gate.evaluate.bind(gate);
    gate.evaluate = async (phase: string, output: Record<string, unknown>, context: GateContext) => {
      if (phase === "plan") {
        planGateCallCount++;
        if (planGateCallCount === 1) {
          return { action: "rework" as const, reason: "Missing test strategy" };
        }
        return { action: "proceed" as const, reason: "Plan improved" };
      }
      if (phase === "implement") {
        return { action: "proceed" as const, reason: "Impl OK" };
      }
      return origEvaluate(phase, output, context);
    };

    const run = await orchestrator.runWorkflow(202);

    // Plan should have been called twice (original + rework)
    expect(planCallCount).toBe(2);
    expect(run.status).toBe("done");
  });

  it("escalates when plan gate keeps rejecting beyond max rounds", async () => {
    github.seedIssue("org/repo", makeIssue(203));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Bad plan" } });
    gate.setVerdict("triage", { action: "proceed", reason: "OK" });
    // Plan gate always rejects
    gate.setVerdict("plan", { action: "rework", reason: "Plan is inadequate" });

    const run = await orchestrator.runWorkflow(203);

    expect(run.status).toBe("escalated");
  });

  it("escalates when implement gate rejects", async () => {
    github.seedIssue("org/repo", makeIssue(204));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Incomplete impl" } });

    gate.setVerdict("triage", { action: "proceed", reason: "OK" });
    gate.setVerdict("plan", { action: "proceed", reason: "OK" });
    gate.setVerdict("implement", { action: "escalate", reason: "Implementation incomplete" });

    const run = await orchestrator.runWorkflow(204);

    expect(run.status).toBe("escalated");
  });

  it("verify gate blocks when verdict is rework", async () => {
    github.seedIssue("org/repo", makeIssue(206));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Done" } });
    launcher.setResponse("verify", {
      exitCode: 0,
      output: { result: { allPassed: false }, summary: "Tests failing" },
    });

    gate.setVerdict("triage", { action: "proceed", reason: "OK" });
    gate.setVerdict("plan", { action: "proceed", reason: "OK" });
    gate.setVerdict("implement", { action: "proceed", reason: "OK" });
    gate.setVerdict("verify", { action: "rework", reason: "Tests are failing, needs fixes" });

    const run = await orchestrator.runWorkflow(206);

    // Verify gate rework should escalate (no rework loop for verify)
    expect(run.status).toBe("escalated");

    // PR should NOT have been opened
    expect(run.prNumber).toBeNull();

    // Verify gate should have been called
    const gatePhases = gate.calls.map((c) => c.phase);
    expect(gatePhases).toContain("verify");

    // Should have a verify gate_verdict artifact
    const artifacts = store.getArtifactsByWorkflow(run.id);
    const verifyGate = artifacts.find((a) => a.type === "gate_verdict" && a.phase === "verify");
    expect(verifyGate).toBeDefined();
    expect(verifyGate!.summary).toContain("Tests are failing");
  });

  it("cancel request stops workflow", async () => {
    github.seedIssue("org/repo", makeIssue(207));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });

    // After triage gate, request cancellation so it stops before plan
    const origEvaluate = gate.evaluate.bind(gate);
    gate.evaluate = async (phase: string, output: Record<string, unknown>, context: GateContext) => {
      const result = await origEvaluate(phase, output, context);
      if (phase === "triage") {
        // Request cancel right after triage gate evaluates
        orchestrator.requestCancel(context.workflowRunId);
      }
      return result;
    };

    gate.setVerdict("triage", { action: "proceed", reason: "OK" });

    const run = await orchestrator.runWorkflow(207);

    // Should have been cancelled (failed status with cancel reason)
    expect(run.status).toBe("failed");
  });

  it("budget exceeded stops workflow", async () => {
    // Create orchestrator with very tight budget (0 minutes wall time)
    const tightConfig = {
      ...defaultConfig(),
      mode: "watch" as const,
      budget: {
        ...defaultConfig().budget,
        run_wall_time_minutes: 0, // immediately exceeded
      },
    };
    const tightOrchestrator = new WorkflowOrchestrator({
      store, github, launcher, repo: "org/repo", config: tightConfig, reviewGate: gate,
    });

    github.seedIssue("org/repo", makeIssue(208));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });

    gate.setVerdict("triage", { action: "proceed", reason: "OK" });

    const run = await tightOrchestrator.runWorkflow(208);

    // Should be budget_exceeded since wall time is 0 minutes
    expect(run.status).toBe("budget_exceeded");
  });

  it("budget exceeded on cost limit", async () => {
    // Create orchestrator with very low cost budget
    const costConfig = {
      ...defaultConfig(),
      mode: "watch" as const,
      budget: {
        ...defaultConfig().budget,
        run_wall_time_minutes: 9999, // not exceeded
        run_max_cost_usd: 0.01, // very low cost limit
      },
    };
    const costOrchestrator = new WorkflowOrchestrator({
      store, github, launcher, repo: "org/repo", config: costConfig, reviewGate: gate,
    });

    github.seedIssue("org/repo", makeIssue(209));
    // Triage succeeds but costs money
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" }, costUsd: 0.05 });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });

    gate.setVerdict("triage", { action: "proceed", reason: "OK" });

    const run = await costOrchestrator.runWorkflow(209);

    // Should be budget_exceeded since cost exceeds $0.01 limit
    expect(run.status).toBe("budget_exceeded");
  });

  it("does not use gates in assisted mode", async () => {
    // Create an assisted-mode orchestrator with the same gate
    const assistedConfig = { ...defaultConfig(), mode: "assisted" as const };
    const assistedOrchestrator = new WorkflowOrchestrator({
      store, github, launcher, repo: "org/repo", config: assistedConfig, reviewGate: gate,
    });

    github.seedIssue("org/repo", makeIssue(205));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });

    // In assisted mode, runWorkflow without autoApprove should stop at plan_draft
    const run = await assistedOrchestrator.runWorkflow(205);
    expect(run.status).toBe("plan_draft");

    // Gate should NOT have been called
    expect(gate.calls).toHaveLength(0);
  });
});
