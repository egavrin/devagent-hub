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

function makeIssue(n: number): GitHubIssue {
  return {
    number: n, title: `Issue ${n}`, body: "Fix it",
    labels: ["da:ready"], url: `https://github.com/org/repo/issues/${n}`,
    state: "open", author: "user", createdAt: new Date().toISOString(), comments: [],
  };
}

describe("WorkflowOrchestrator — review", () => {
  let store: StateStore;
  let github: MockGitHubGateway;
  let launcher: MockRunLauncher;
  let orchestrator: WorkflowOrchestrator;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `hub-review-test-${Date.now()}.db`);
    store = new StateStore(dbPath);
    github = new MockGitHubGateway();
    launcher = new MockRunLauncher();
    const config = { ...defaultConfig(), repair: { max_rounds: 2 } };
    orchestrator = new WorkflowOrchestrator({ store, github, launcher, repo: "org/repo", config });
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  // Helper to drive workflow to draft_pr_opened state
  async function driveToOpenPR(issueNumber: number) {
    github.seedIssue("org/repo", makeIssue(issueNumber));
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Done" } });
    launcher.setResponse("verify", {
      exitCode: 0,
      output: { result: { allPassed: true }, summary: "Pass" },
    });
    await orchestrator.triage(issueNumber);
    await orchestrator.plan(issueNumber);
    await orchestrator.approvePlan(issueNumber);
    await orchestrator.implement(issueNumber);
    await orchestrator.verify(issueNumber);
    await orchestrator.openPR(issueNumber);
  }

  it("runs review and transitions to awaiting_human_review on pass", async () => {
    await driveToOpenPR(40);
    launcher.setResponse("review", {
      exitCode: 0,
      output: {
        schemaVersion: 1, phase: "review",
        result: { findings: [], blockingCount: 0, warningCount: 0, infoCount: 0, verdict: "pass" },
        summary: "No issues found.",
      },
    });

    const run = await orchestrator.review(40);
    expect(run.status).toBe("awaiting_human_review");
  });

  it("enters repair loop on blocking review findings", async () => {
    await driveToOpenPR(41);
    launcher.setResponse("review", {
      exitCode: 0,
      output: {
        schemaVersion: 1, phase: "review",
        result: {
          findings: [{ severity: "blocking", file: "src/a.ts", message: "Missing null check" }],
          blockingCount: 1, warningCount: 0, infoCount: 0, verdict: "block",
        },
        summary: "1 blocking issue found.",
      },
    });

    const run = await orchestrator.review(41);
    expect(run.status).toBe("auto_review_fix_loop");
  });

  it("runs repair and transitions back to draft_pr_opened", async () => {
    await driveToOpenPR(45);
    launcher.setResponse("review", {
      exitCode: 0,
      output: {
        result: { findings: [{ severity: "blocking", file: "a.ts", message: "Bug" }], blockingCount: 1, verdict: "block" },
        summary: "1 blocking issue.",
      },
    });
    launcher.setResponse("repair", {
      exitCode: 0,
      output: {
        schemaVersion: 1, phase: "repair",
        result: { round: 1, inputFindings: 1, fixedFindings: 1, remainingFindings: 0, filesModified: ["a.ts"], verificationPassed: true },
        summary: "Fixed 1 issue.",
      },
    });

    await orchestrator.review(45);
    const run = await orchestrator.repair(45);

    expect(run.status).toBe("draft_pr_opened");
    expect(run.repairRound).toBe(1);
  });

  it("escalates after max repair rounds", async () => {
    await driveToOpenPR(46);
    launcher.setResponse("review", {
      exitCode: 0,
      output: { result: { blockingCount: 1, verdict: "block" }, summary: "Issue." },
    });
    launcher.setResponse("repair", {
      exitCode: 0,
      output: { result: { remainingFindings: 1, verificationPassed: false }, summary: "Could not fix." },
    });

    // Round 1
    await orchestrator.review(46);
    await orchestrator.repair(46);
    // Round 2
    await orchestrator.review(46);
    await orchestrator.repair(46); // should escalate (max_rounds=2)

    const run = store.getWorkflowRunByIssue("org/repo", 46)!;
    expect(run.status).toBe("escalated");
  });
});
