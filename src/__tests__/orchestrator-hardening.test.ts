import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import { StateStore } from "../state/store.js";
import { MockGitHubGateway } from "../github/mock-gateway.js";
import { MockRunLauncher } from "../runner/mock-launcher.js";
import { unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { GitHubIssue } from "../github/types.js";

function makeIssue(n: number): GitHubIssue {
  return {
    number: n, title: `Issue ${n}`, body: "Fix it",
    labels: ["da:ready"], url: `https://github.com/org/repo/issues/${n}`,
    state: "open", author: "user", createdAt: new Date().toISOString(), comments: [],
  };
}

describe("WorkflowOrchestrator — hardening", () => {
  let store: StateStore;
  let github: MockGitHubGateway;
  let launcher: MockRunLauncher;
  let orchestrator: WorkflowOrchestrator;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `hub-hardening-test-${Date.now()}.db`);
    store = new StateStore(dbPath);
    github = new MockGitHubGateway();
    launcher = new MockRunLauncher();
    orchestrator = new WorkflowOrchestrator({ store, github, launcher, repo: "org/repo" });
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("transitions to failed when verify agent fails", async () => {
    github.seedIssue("org/repo", makeIssue(200));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Done" } });
    launcher.setResponse("verify", { exitCode: 1, output: null });

    await orchestrator.triage(200);
    await orchestrator.plan(200);
    await orchestrator.approvePlan(200);
    await orchestrator.implement(200);
    const run = await orchestrator.verify(200);

    expect(run.status).toBe("failed");
    expect(run.currentPhase).toBe("verify");
  });

  it("survives GitHub addComment failure during triage", async () => {
    github.seedIssue("org/repo", makeIssue(201));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });

    // Make addComment throw after the first call
    const origAddComment = github.addComment.bind(github);
    let callCount = 0;
    github.addComment = async (...args: Parameters<typeof github.addComment>) => {
      callCount++;
      if (callCount > 0) throw new Error("GitHub API rate limit exceeded");
      return origAddComment(...args);
    };

    // Suppress stderr during this test
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const run = await orchestrator.triage(201);

    stderrSpy.mockRestore();

    // Workflow should still complete despite GitHub comment failure
    expect(run.status).toBe("triaged");
  });

  it("survives GitHub addLabels failure during triage", async () => {
    github.seedIssue("org/repo", makeIssue(202));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });

    // Make addLabels throw
    github.addLabels = async () => { throw new Error("GitHub API error"); };

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const run = await orchestrator.triage(202);

    stderrSpy.mockRestore();

    expect(run.status).toBe("triaged");
  });

  it("stores verification artifact on verify success", async () => {
    github.seedIssue("org/repo", makeIssue(203));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Done" } });
    launcher.setResponse("verify", {
      exitCode: 0,
      output: { summary: "All tests pass", passed: true, results: [] },
    });

    await orchestrator.triage(203);
    await orchestrator.plan(203);
    await orchestrator.approvePlan(203);
    await orchestrator.implement(203);
    const run = await orchestrator.verify(203);

    expect(run.status).toBe("awaiting_local_verify");
    const artifacts = store.getArtifactsByWorkflow(run.id);
    const verifyArtifact = artifacts.find(a => a.type === "verification_report");
    expect(verifyArtifact).toBeDefined();
    expect(verifyArtifact!.summary).toBe("All tests pass");
  });

  it("creates artifact chain across full workflow", async () => {
    github.seedIssue("org/repo", makeIssue(204));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "Triage OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan OK" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Implemented" } });
    launcher.setResponse("verify", { exitCode: 0, output: { summary: "Verified", passed: true, results: [] } });
    launcher.setResponse("review", { exitCode: 0, output: { findings: [], blockingCount: 0, verdict: "pass", summary: "Clean" } });

    const run = await orchestrator.runWorkflow(204, { autoApprove: true });

    expect(run.status).toBe("awaiting_human_review");
    const artifacts = store.getArtifactsByWorkflow(run.id);
    const types = artifacts.map(a => a.type);
    expect(types).toContain("triage_report");
    expect(types).toContain("plan_draft");
    expect(types).toContain("accepted_plan");
    expect(types).toContain("implementation_report");
    expect(types).toContain("verification_report");
    expect(types).toContain("review_report");
  });

  it("records complete transition audit trail", async () => {
    github.seedIssue("org/repo", makeIssue(205));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });

    await orchestrator.triage(205);
    await orchestrator.plan(205);

    const run = store.getWorkflowRunByIssue("org/repo", 205)!;
    const transitions = store.getTransitions(run.id);
    const statuses = transitions.map(t => t.to);

    expect(statuses).toEqual(["triaged", "plan_draft"]);
    expect(transitions.every(t => t.reason.length > 0)).toBe(true);
    expect(transitions.every(t => t.timestamp.length > 0)).toBe(true);
  });
});
