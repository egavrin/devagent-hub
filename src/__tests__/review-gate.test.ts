import { describe, it, expect } from "vitest";
import { LLMReviewGate } from "../workflow/review-gate.js";
import { MockRunLauncher } from "../runner/mock-launcher.js";

describe("LLMReviewGate", () => {
  it("returns proceed when review passes", async () => {
    const launcher = new MockRunLauncher();
    launcher.setResponse("gate", {
      exitCode: 0,
      output: { verdict: "pass", blockingCount: 0, summary: "Looks good." },
    });

    const gate = new LLMReviewGate(launcher);
    const verdict = await gate.evaluate("triage", { summary: "OK" }, {
      workflowRunId: "run-1",
      repoPath: "/tmp/repo",
      issueNumber: 10,
    });

    expect(verdict.action).toBe("proceed");
    expect(verdict.reason).toBe("Looks good.");
  });

  it("returns rework when review blocks", async () => {
    const launcher = new MockRunLauncher();
    launcher.setResponse("gate", {
      exitCode: 0,
      output: {
        verdict: "block",
        blockingCount: 2,
        summary: "Missing test strategy.",
        findings: [{ message: "No tests" }, { message: "Missing edge cases" }],
      },
    });

    const gate = new LLMReviewGate(launcher);
    const verdict = await gate.evaluate("plan", { summary: "Do stuff" }, {
      workflowRunId: "run-2",
      repoPath: "/tmp/repo",
      issueNumber: 11,
    });

    expect(verdict.action).toBe("rework");
    expect(verdict.reason).toBe("Missing test strategy.");
    expect(verdict.findings).toHaveLength(2);
  });

  it("returns escalate when review crashes", async () => {
    const launcher = new MockRunLauncher();
    launcher.setResponse("gate", { exitCode: 1, output: null });

    const gate = new LLMReviewGate(launcher);
    const verdict = await gate.evaluate("triage", { summary: "OK" }, {
      workflowRunId: "run-3",
      repoPath: "/tmp/repo",
      issueNumber: 12,
    });

    expect(verdict.action).toBe("escalate");
    expect(verdict.reason).toContain("exit code 1");
  });

  it("passes gateReview flag and sourcePhase to launcher", async () => {
    const launcher = new MockRunLauncher();
    launcher.setResponse("gate", {
      exitCode: 0,
      output: { verdict: "pass", summary: "OK" },
    });

    const gate = new LLMReviewGate(launcher);
    await gate.evaluate("plan", { summary: "Plan details" }, {
      workflowRunId: "run-4",
      repoPath: "/tmp/repo",
      issueNumber: 13,
    });

    expect(launcher.launches).toHaveLength(1);
    expect(launcher.launches[0].phase).toBe("gate");
    const input = launcher.launches[0].input as Record<string, unknown>;
    expect(input.sourcePhase).toBe("plan");
    expect(input.stageOutput).toEqual({ summary: "Plan details" });
  });
});
