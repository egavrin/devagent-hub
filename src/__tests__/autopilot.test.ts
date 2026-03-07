import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AutopilotDaemon } from "../workflow/autopilot.js";
import { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import { StateStore } from "../state/store.js";
import { MockGitHubGateway } from "../github/mock-gateway.js";
import { MockRunLauncher } from "../runner/mock-launcher.js";
import { defaultConfig } from "../workflow/config.js";
import type { WorkflowConfig } from "../workflow/config.js";
import type { AutopilotEvent } from "../workflow/autopilot.js";
import type { ReviewGate, GateVerdict, GateContext } from "../workflow/review-gate.js";
import { unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { GitHubIssue } from "../github/types.js";

function makeIssue(n: number, labels: string[] = ["devagent"]): GitHubIssue {
  return {
    number: n, title: `Issue ${n}`, body: "Test issue body",
    labels, url: `https://github.com/org/repo/issues/${n}`,
    state: "open", author: "user", createdAt: new Date(Date.now() - n * 60000).toISOString(),
    comments: [],
  };
}

class MockReviewGate implements ReviewGate {
  async evaluate(_phase: string, _output: Record<string, unknown>, _context: GateContext): Promise<GateVerdict> {
    return { action: "proceed", reason: "Auto-pass" };
  }
}

function makeConfig(): WorkflowConfig {
  const config = defaultConfig();
  config.mode = "autopilot";
  config.autopilot = {
    poll_interval_seconds: 0.1,
    max_concurrent_runs: 2,
    eligible_labels: ["devagent"],
    priority_labels: ["urgent", "priority"],
    exclude_labels: ["blocked"],
  };
  return config;
}

describe("AutopilotDaemon", () => {
  let store: StateStore;
  let github: MockGitHubGateway;
  let launcher: MockRunLauncher;
  let orchestrator: WorkflowOrchestrator;
  let dbPath: string;
  let config: WorkflowConfig;

  beforeEach(() => {
    dbPath = join(tmpdir(), `hub-autopilot-test-${Date.now()}.db`);
    store = new StateStore(dbPath);
    github = new MockGitHubGateway();
    launcher = new MockRunLauncher();
    config = makeConfig();
    orchestrator = new WorkflowOrchestrator({
      store, github, launcher, repo: "org/repo", config,
      reviewGate: new MockReviewGate(),
    });
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("discovers and dispatches eligible issues", async () => {
    github.seedIssue("org/repo", makeIssue(1));
    github.seedIssue("org/repo", makeIssue(2));
    // seedIssue already makes them eligible via fetchEligibleIssues

    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Done" } });
    launcher.setResponse("verify", { exitCode: 0, output: { summary: "Pass", passed: true } });
    launcher.setResponse("review", { exitCode: 0, output: { verdict: "pass", blockingCount: 0, summary: "Clean" } });
    launcher.setResponse("gate", { exitCode: 0, output: { verdict: "pass", blockingCount: 0, summary: "Gate OK" } });

    const events: AutopilotEvent[] = [];
    const controller = new AbortController();

    const daemon = new AutopilotDaemon({
      store, github, orchestrator, config, repo: "org/repo",
      signal: controller.signal,
      onEvent: (e) => {
        events.push(e);
        // Stop after first poll completes
        if (e.type === "poll_done" && e.dispatched > 0) {
          // Give runs time to complete
          setTimeout(() => controller.abort(), 500);
        }
      },
    });

    await daemon.run();

    const dispatches = events.filter((e) => e.type === "dispatch");
    expect(dispatches.length).toBeGreaterThanOrEqual(1);
    expect(dispatches.length).toBeLessThanOrEqual(2);
  });

  it("respects max_concurrent_runs limit", async () => {
    // Create 3 issues but limit to 2 concurrent
    for (const n of [1, 2, 3]) github.seedIssue("org/repo", makeIssue(n));

    // Make runs take some time
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Done" } });
    launcher.setResponse("verify", { exitCode: 0, output: { summary: "Pass" } });
    launcher.setResponse("review", { exitCode: 0, output: { verdict: "pass", blockingCount: 0, summary: "Clean" } });
    launcher.setResponse("gate", { exitCode: 0, output: { verdict: "pass", blockingCount: 0, summary: "Gate OK" } });

    let firstPollDispatchCount = 0;
    let firstPollSeen = false;
    const controller = new AbortController();

    const daemon = new AutopilotDaemon({
      store, github, orchestrator, config, repo: "org/repo",
      signal: controller.signal,
      onEvent: (e) => {
        if (e.type === "poll_done" && !firstPollSeen) {
          firstPollSeen = true;
          firstPollDispatchCount = e.dispatched;
          controller.abort();
        }
      },
    });

    await daemon.run();

    // First poll should dispatch at most 2 (max_concurrent_runs)
    expect(firstPollDispatchCount).toBeLessThanOrEqual(2);
  });

  it("skips issues with exclude labels", async () => {
    github.seedIssue("org/repo", makeIssue(1));
    github.seedIssue("org/repo", makeIssue(2, ["devagent", "blocked"]));

    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Done" } });
    launcher.setResponse("verify", { exitCode: 0, output: { summary: "Pass" } });
    launcher.setResponse("review", { exitCode: 0, output: { verdict: "pass", blockingCount: 0, summary: "Clean" } });
    launcher.setResponse("gate", { exitCode: 0, output: { verdict: "pass", blockingCount: 0, summary: "Gate OK" } });

    const events: AutopilotEvent[] = [];
    const controller = new AbortController();

    const daemon = new AutopilotDaemon({
      store, github, orchestrator, config, repo: "org/repo",
      signal: controller.signal,
      onEvent: (e) => {
        events.push(e);
        if (e.type === "poll_done") {
          setTimeout(() => controller.abort(), 300);
        }
      },
    });

    await daemon.run();

    const dispatched = events.filter((e) => e.type === "dispatch") as Array<{ type: "dispatch"; issueNumber: number; title: string }>;
    // Only issue 1 should be dispatched (issue 2 has "blocked" label)
    expect(dispatched.length).toBe(1);
    expect(dispatched[0].issueNumber).toBe(1);
  });

  it("prioritizes issues with priority labels", async () => {
    github.seedIssue("org/repo", makeIssue(1));
    github.seedIssue("org/repo", makeIssue(2, ["devagent", "urgent"]));

    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
    launcher.setResponse("implement", { exitCode: 0, output: { summary: "Done" } });
    launcher.setResponse("verify", { exitCode: 0, output: { summary: "Pass" } });
    launcher.setResponse("review", { exitCode: 0, output: { verdict: "pass", blockingCount: 0, summary: "Clean" } });
    launcher.setResponse("gate", { exitCode: 0, output: { verdict: "pass", blockingCount: 0, summary: "Gate OK" } });

    // Only allow 1 concurrent to see which is dispatched first
    config.autopilot.max_concurrent_runs = 1;

    const dispatched: number[] = [];
    const controller = new AbortController();

    const daemon = new AutopilotDaemon({
      store, github, orchestrator, config, repo: "org/repo",
      signal: controller.signal,
      onEvent: (e) => {
        if (e.type === "dispatch") dispatched.push(e.issueNumber);
        if (e.type === "poll_done") {
          setTimeout(() => controller.abort(), 300);
        }
      },
    });

    await daemon.run();

    // Issue 2 (urgent) should be dispatched first
    expect(dispatched[0]).toBe(2);
  });

  it("skips issues that already have active runs", async () => {
    github.seedIssue("org/repo", makeIssue(1));

    // Create an existing run for issue 1
    launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
    launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
    await orchestrator.triage(1);

    const events: AutopilotEvent[] = [];
    const controller = new AbortController();

    const daemon = new AutopilotDaemon({
      store, github, orchestrator, config, repo: "org/repo",
      signal: controller.signal,
      onEvent: (e) => {
        events.push(e);
        if (e.type === "poll_done") controller.abort();
      },
    });

    await daemon.run();

    const dispatched = events.filter((e) => e.type === "dispatch");
    expect(dispatched.length).toBe(0);
  });

  it("stops gracefully on abort signal", async () => {
    // No issues seeded — empty poll

    const events: AutopilotEvent[] = [];
    const controller = new AbortController();

    const daemon = new AutopilotDaemon({
      store, github, orchestrator, config, repo: "org/repo",
      signal: controller.signal,
      onEvent: (e) => {
        events.push(e);
        if (e.type === "poll_done") controller.abort();
      },
    });

    await daemon.run();

    expect(events.some((e) => e.type === "stopped")).toBe(true);
  });
});
