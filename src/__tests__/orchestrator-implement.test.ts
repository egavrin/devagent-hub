import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StateStore } from "../state/store.js";
import { MockGitHubGateway } from "../github/mock-gateway.js";
import { MockRunLauncher } from "../runner/mock-launcher.js";
import { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import type { GitHubIssue } from "../github/types.js";
import type { WorktreeManager, WorktreeInfo } from "../workspace/worktree-manager.js";
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

/** Minimal mock that satisfies WorktreeManager.create() without touching git. */
function makeMockWorktreeManager(): WorktreeManager {
  return {
    create(issueNumber: number, repoRoot: string): WorktreeInfo {
      return {
        path: `/tmp/worktrees/issue-${issueNumber}`,
        branch: `da/issue-${issueNumber}`,
        repoRoot,
      };
    },
    remove() {},
    list() { return []; },
  } as unknown as WorktreeManager;
}

/** Helper: run triage + plan + approve to reach "plan_accepted" state. */
async function setupPlanAccepted(
  orchestrator: WorkflowOrchestrator,
  github: MockGitHubGateway,
  launcher: MockRunLauncher,
) {
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
  await orchestrator.approvePlan(42);
}

describe("WorkflowOrchestrator — implement", () => {
  let store: StateStore;
  let github: MockGitHubGateway;
  let launcher: MockRunLauncher;
  let dbPath: string;

  beforeEach(() => {
    dbPath = `/tmp/test-orch-impl-${randomUUID()}.sqlite`;
    store = new StateStore(dbPath);
    github = new MockGitHubGateway();
    launcher = new MockRunLauncher();
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("runs implementation after plan approval", async () => {
    const worktreeManager = makeMockWorktreeManager();
    const orchestrator = new WorkflowOrchestrator({
      store,
      github,
      launcher,
      repo: REPO,
      repoRoot: "/tmp/test-repo",
      worktreeManager,
    });

    await setupPlanAccepted(orchestrator, github, launcher);

    launcher.setResponse("implement", {
      exitCode: 0,
      output: { schemaVersion: 1, phase: "implement", result: {}, summary: "Implemented." },
    });

    const run = await orchestrator.implement(42);

    expect(run.status).toBe("implementing");
    expect(run.currentPhase).toBe("implement");
    expect(run.branch).toBe("da/issue-42");
    expect(run.worktreePath).toBe("/tmp/worktrees/issue-42");

    // Launcher should have been called with worktree path
    const implLaunch = launcher.launches.find((l) => l.phase === "implement");
    expect(implLaunch).toBeDefined();
    expect(implLaunch!.repoPath).toBe("/tmp/worktrees/issue-42");
  });

  it("fails implementation gracefully", async () => {
    const orchestrator = new WorkflowOrchestrator({
      store,
      github,
      launcher,
      repo: REPO,
      repoRoot: "/tmp/test-repo",
      worktreeManager: makeMockWorktreeManager(),
    });

    await setupPlanAccepted(orchestrator, github, launcher);

    launcher.setResponse("implement", {
      exitCode: 1,
      output: { error: "Implement agent crashed" },
    });

    const run = await orchestrator.implement(42);

    expect(run.status).toBe("failed");

    // Failure comment should be posted
    const updatedIssue = await github.fetchIssue(REPO, 42);
    const failComment = updatedIssue.comments.find((c) =>
      c.body.includes("implementation failed"),
    );
    expect(failComment).toBeDefined();
  });

  it("works in main repo when no worktree manager is provided", async () => {
    const orchestrator = new WorkflowOrchestrator({
      store,
      github,
      launcher,
      repo: REPO,
      repoRoot: "/tmp/test-repo",
      // No worktreeManager
    });

    await setupPlanAccepted(orchestrator, github, launcher);

    launcher.setResponse("implement", {
      exitCode: 0,
      output: { schemaVersion: 1, phase: "implement", result: {}, summary: "Done." },
    });

    const run = await orchestrator.implement(42);

    expect(run.status).toBe("implementing");
    expect(run.currentPhase).toBe("implement");
    // branch/worktreePath should remain null (no worktree manager)
    expect(run.branch).toBeNull();
    expect(run.worktreePath).toBeNull();

    // Launcher should have been called with main repo path
    const implLaunch = launcher.launches.find((l) => l.phase === "implement");
    expect(implLaunch).toBeDefined();
    expect(implLaunch!.repoPath).toBe("/tmp/test-repo");
  });

  it("throws if workflow run is not in plan_accepted status", async () => {
    const orchestrator = new WorkflowOrchestrator({
      store,
      github,
      launcher,
      repo: REPO,
      repoRoot: "/tmp/test-repo",
    });

    // Only triage — status will be "triaged", not "plan_accepted"
    github.seedIssue(REPO, makeIssue());
    launcher.setResponse("triage", {
      exitCode: 0,
      output: { schemaVersion: 1, phase: "triage", result: {}, summary: "Triaged." },
    });
    await orchestrator.triage(42);

    await expect(orchestrator.implement(42)).rejects.toThrow(
      /expected status "plan_accepted"/,
    );
  });
});
