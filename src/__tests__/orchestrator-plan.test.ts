import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StateStore } from "../state/store.js";
import { MockGitHubGateway } from "../github/mock-gateway.js";
import { MockRunLauncher } from "../runner/mock-launcher.js";
import { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import type { GitHubIssue } from "../github/types.js";
import { unlinkSync } from "fs";
import { randomUUID } from "crypto";

const REPO = "test-org/test-repo";

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 42,
    title: "Fix login bug",
    body: "The login form breaks on mobile",
    labels: ["da:ready", "bug"],
    url: `https://github.com/${REPO}/issues/42`,
    state: "open",
    author: "alice",
    createdAt: new Date().toISOString(),
    comments: [],
    ...overrides,
  };
}

describe("WorkflowOrchestrator — plan", () => {
  let store: StateStore;
  let github: MockGitHubGateway;
  let launcher: MockRunLauncher;
  let orchestrator: WorkflowOrchestrator;
  let dbPath: string;

  beforeEach(() => {
    dbPath = `/tmp/test-orch-plan-${randomUUID()}.sqlite`;
    store = new StateStore(dbPath);
    github = new MockGitHubGateway();
    launcher = new MockRunLauncher();
    orchestrator = new WorkflowOrchestrator({
      store,
      github,
      launcher,
      repo: REPO,
      repoRoot: "/tmp/test-repo",
    });
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("runs plan after triage and posts plan summary", async () => {
    const issue = makeIssue();
    github.seedIssue(REPO, issue);
    launcher.setResponse("triage", {
      exitCode: 0,
      output: { schemaVersion: 1, phase: "triage", result: {}, summary: "Triaged." },
    });
    launcher.setResponse("plan", {
      exitCode: 0,
      output: {
        schemaVersion: 1,
        phase: "plan",
        result: {},
        summary: "Plan: fix the mobile CSS breakpoint in login.tsx.",
      },
    });

    // First triage, then plan
    await orchestrator.triage(42);
    const run = await orchestrator.plan(42);

    expect(run.status).toBe("plan_draft");
    expect(run.currentPhase).toBe("plan");

    // Plan summary comment should be posted with approval prompt
    const updatedIssue = await github.fetchIssue(REPO, 42);
    const planComment = updatedIssue.comments.find((c) =>
      c.body.includes("DevAgent Plan Summary"),
    );
    expect(planComment).toBeDefined();
    expect(planComment!.body).toContain("fix the mobile CSS breakpoint");
    expect(planComment!.body).toContain("approve");

    // Launcher should have been called for plan phase
    const planLaunch = launcher.launches.find((l) => l.phase === "plan");
    expect(planLaunch).toBeDefined();
    expect(planLaunch!.repoPath).toBe("/tmp/test-repo");
  });

  it("transitions to failed on plan failure", async () => {
    const issue = makeIssue();
    github.seedIssue(REPO, issue);
    launcher.setResponse("triage", {
      exitCode: 0,
      output: { schemaVersion: 1, phase: "triage", result: {}, summary: "Triaged." },
    });
    launcher.setResponse("plan", {
      exitCode: 1,
      output: { error: "Plan agent crashed" },
    });

    await orchestrator.triage(42);
    const run = await orchestrator.plan(42);

    expect(run.status).toBe("failed");

    // Failure comment should be posted
    const updatedIssue = await github.fetchIssue(REPO, 42);
    const failComment = updatedIssue.comments.find((c) =>
      c.body.includes("plan failed"),
    );
    expect(failComment).toBeDefined();
  });

  it("accepts plan and transitions to plan_accepted", async () => {
    const issue = makeIssue();
    github.seedIssue(REPO, issue);
    launcher.setResponse("triage", {
      exitCode: 0,
      output: { schemaVersion: 1, phase: "triage", result: {}, summary: "Triaged." },
    });
    launcher.setResponse("plan", {
      exitCode: 0,
      output: { schemaVersion: 1, phase: "plan", result: {}, summary: "The plan." },
    });

    await orchestrator.triage(42);
    await orchestrator.plan(42);
    const run = await orchestrator.approvePlan(42);

    expect(run.status).toBe("plan_accepted");

    // Approval comment should be posted
    const updatedIssue = await github.fetchIssue(REPO, 42);
    const approveComment = updatedIssue.comments.find((c) =>
      c.body.includes("Plan approved"),
    );
    expect(approveComment).toBeDefined();
  });

  it("runs triage then plan in sequence via triageAndPlan", async () => {
    const issue = makeIssue();
    github.seedIssue(REPO, issue);
    launcher.setResponse("triage", {
      exitCode: 0,
      output: { schemaVersion: 1, phase: "triage", result: {}, summary: "Triaged." },
    });
    launcher.setResponse("plan", {
      exitCode: 0,
      output: {
        schemaVersion: 1,
        phase: "plan",
        result: {},
        summary: "Implementation plan ready.",
      },
    });

    const run = await orchestrator.triageAndPlan(42);

    expect(run.status).toBe("plan_draft");
    expect(run.currentPhase).toBe("plan");

    // Both phases should have been launched
    expect(launcher.launches).toHaveLength(2);
    expect(launcher.launches[0].phase).toBe("triage");
    expect(launcher.launches[1].phase).toBe("plan");
  });
});
