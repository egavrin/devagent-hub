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

function successResponse(phase: string) {
  return {
    exitCode: 0,
    output: { schemaVersion: 1, phase, result: {}, summary: `${phase} done.` },
  };
}

/** Run triage -> plan -> approve -> implement so the workflow is ready for verify/PR. */
async function advanceToImplemented(
  orchestrator: WorkflowOrchestrator,
  github: MockGitHubGateway,
  launcher: MockRunLauncher,
) {
  const issue = makeIssue();
  github.seedIssue(REPO, issue);
  launcher.setResponse("triage", successResponse("triage"));
  launcher.setResponse("plan", successResponse("plan"));
  launcher.setResponse("implement", successResponse("implement"));

  await orchestrator.triage(42);
  await orchestrator.plan(42);
  await orchestrator.approvePlan(42);
  await orchestrator.implement(42);
}

describe("WorkflowOrchestrator — verify & PR", () => {
  let store: StateStore;
  let github: MockGitHubGateway;
  let launcher: MockRunLauncher;
  let orchestrator: WorkflowOrchestrator;
  let dbPath: string;

  beforeEach(() => {
    dbPath = `/tmp/test-orch-pr-${randomUUID()}.sqlite`;
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

  it("verify transitions to awaiting_local_verify on success", async () => {
    await advanceToImplemented(orchestrator, github, launcher);
    launcher.setResponse("verify", successResponse("verify"));

    const run = await orchestrator.verify(42);

    expect(run.status).toBe("awaiting_local_verify");

    // Verify phase should have been launched with commands input
    const verifyLaunch = launcher.launches.find((l) => l.phase === "verify");
    expect(verifyLaunch).toBeDefined();
    expect(verifyLaunch!.input).toEqual({
      commands: ["bun run test", "bun run typecheck"],
    });
  });

  it("verify transitions to failed when agent fails", async () => {
    await advanceToImplemented(orchestrator, github, launcher);
    launcher.setResponse("verify", { exitCode: 1, output: { error: "tests failed" } });

    const run = await orchestrator.verify(42);

    expect(run.status).toBe("failed");

    const issue = await github.fetchIssue(REPO, 42);
    const failComment = issue.comments.find((c) =>
      c.body.includes("verification failed"),
    );
    expect(failComment).toBeDefined();
  });

  it("opens draft PR after successful verification", async () => {
    await advanceToImplemented(orchestrator, github, launcher);
    launcher.setResponse("verify", successResponse("verify"));

    await orchestrator.verify(42);
    const run = await orchestrator.openPR(42);

    expect(run.status).toBe("draft_pr_opened");
    expect(run.prNumber).toBeGreaterThan(0);
    expect(run.prUrl).toContain("/pull/");

    // Check the PR was created as draft
    const pr = await github.fetchPR(REPO, run.prNumber!);
    expect(pr.draft).toBe(true);
    expect(pr.title).toBe("[DevAgent] Fix login bug");
    expect(pr.body).toContain("Closes #42");

    // Branch should have been pushed
    expect(github.pushedBranches).toHaveLength(1);
    expect(github.pushedBranches[0].branch).toBe("da/issue-42");

    // Comment about PR should be posted
    const issue = await github.fetchIssue(REPO, 42);
    const prComment = issue.comments.find((c) =>
      c.body.includes("opened a draft PR"),
    );
    expect(prComment).toBeDefined();

    // Label should be added
    expect(issue.labels).toContain("da:pr-open");
  });

  it("PR body includes Closes #N", async () => {
    await advanceToImplemented(orchestrator, github, launcher);
    launcher.setResponse("verify", successResponse("verify"));

    await orchestrator.verify(42);
    const run = await orchestrator.openPR(42);

    const pr = await github.fetchPR(REPO, run.prNumber!);
    expect(pr.body).toBe("Closes #42");
  });

  it("openPR throws if status is not awaiting_local_verify", async () => {
    await advanceToImplemented(orchestrator, github, launcher);

    // Status is "implementing", not "awaiting_local_verify"
    await expect(orchestrator.openPR(42)).rejects.toThrow(
      /expected status "awaiting_local_verify"/,
    );
  });

  it("implementAndPR runs the full pipeline", async () => {
    const issue = makeIssue();
    github.seedIssue(REPO, issue);
    launcher.setResponse("triage", successResponse("triage"));
    launcher.setResponse("plan", successResponse("plan"));
    launcher.setResponse("implement", successResponse("implement"));
    launcher.setResponse("verify", successResponse("verify"));

    await orchestrator.triage(42);
    await orchestrator.plan(42);
    await orchestrator.approvePlan(42);

    const run = await orchestrator.implementAndPR(42);

    expect(run.status).toBe("draft_pr_opened");
    expect(run.prNumber).toBeGreaterThan(0);

    // All phases should have been launched
    const phases = launcher.launches.map((l) => l.phase);
    expect(phases).toContain("implement");
    expect(phases).toContain("verify");
  });

  it("implementAndPR stops on implement failure", async () => {
    const issue = makeIssue();
    github.seedIssue(REPO, issue);
    launcher.setResponse("triage", successResponse("triage"));
    launcher.setResponse("plan", successResponse("plan"));
    launcher.setResponse("implement", { exitCode: 1, output: null });

    await orchestrator.triage(42);
    await orchestrator.plan(42);
    await orchestrator.approvePlan(42);

    const run = await orchestrator.implementAndPR(42);

    expect(run.status).toBe("failed");
    // verify and openPR should not have been called
    const phases = launcher.launches.map((l) => l.phase);
    expect(phases).not.toContain("verify");
  });

  it("implementAndPR stops on verify failure", async () => {
    const issue = makeIssue();
    github.seedIssue(REPO, issue);
    launcher.setResponse("triage", successResponse("triage"));
    launcher.setResponse("plan", successResponse("plan"));
    launcher.setResponse("implement", successResponse("implement"));
    launcher.setResponse("verify", { exitCode: 1, output: null });

    await orchestrator.triage(42);
    await orchestrator.plan(42);
    await orchestrator.approvePlan(42);

    const run = await orchestrator.implementAndPR(42);

    expect(run.status).toBe("failed");
    // No PR should have been created
    expect(run.prNumber).toBeNull();
  });
});
