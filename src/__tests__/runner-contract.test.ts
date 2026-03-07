import { describe, it, expect } from "vitest";
import {
  buildLaunchArgs,
  InvalidLaunchConfigError,
} from "../runner/args-builder.js";
import { validateRunnerCompat } from "../runner/launcher.js";
import type { RunnerDescription } from "../workflow/stage-schemas.js";

const baseParams = {
  phase: "triage" as const,
  repoPath: "/repo",
  inputPath: "/artifacts/input.json",
  outputPath: "/artifacts/output.json",
  eventsPath: "/artifacts/events.jsonl",
};

describe("runner contract: phase validation", () => {
  it("never emits gate as a phase", () => {
    expect(() =>
      buildLaunchArgs({ ...baseParams, phase: "gate" }, {}),
    ).toThrow(InvalidLaunchConfigError);
  });

  it("accepts all valid runner phases", () => {
    for (const phase of ["triage", "plan", "implement", "verify", "review", "repair"]) {
      const args = buildLaunchArgs({ ...baseParams, phase }, {});
      expect(args).toContain(phase);
    }
  });
});

describe("runner contract: --approval flag", () => {
  it("emits --approval not --approval-mode", () => {
    const args = buildLaunchArgs(baseParams, { approvalMode: "full-auto" });
    expect(args).toContain("--approval");
    expect(args).not.toContain("--approval-mode");
  });
});

describe("runner contract: reasoning feature detection", () => {
  it("emits --reasoning when runner supports it", () => {
    const args = buildLaunchArgs(baseParams, {
      reasoning: "high",
      supportedReasoningLevels: ["low", "medium", "high"],
    });
    expect(args).toContain("--reasoning");
    expect(args).toContain("high");
  });

  it("skips --reasoning when runner has no reasoning support", () => {
    const args = buildLaunchArgs(baseParams, {
      reasoning: "high",
      supportedReasoningLevels: [],
    });
    expect(args).not.toContain("--reasoning");
  });

  it("skips --reasoning when supportedReasoningLevels is undefined", () => {
    const args = buildLaunchArgs(baseParams, {
      reasoning: "high",
    });
    expect(args).not.toContain("--reasoning");
  });
});

describe("validateRunnerCompat", () => {
  it("returns incompatible for null description", () => {
    const result = validateRunnerCompat(null);
    expect(result.compatible).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns compatible for a full-featured runner", () => {
    const desc: RunnerDescription = {
      version: "1.0.0",
      contractVersion: 1,
      supportedPhases: ["triage", "plan", "implement", "verify", "review", "repair"],
      availableProviders: ["anthropic"],
      supportedApprovalModes: ["suggest", "auto-edit", "full-auto"],
      supportedReasoningLevels: ["low", "medium", "high"],
    };
    const result = validateRunnerCompat(desc);
    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns errors when required phases are missing", () => {
    const desc: RunnerDescription = {
      version: "1.0.0",
      contractVersion: 1,
      supportedPhases: ["triage", "plan"],
      availableProviders: ["anthropic"],
      supportedApprovalModes: ["suggest"],
      supportedReasoningLevels: ["low"],
    };
    const result = validateRunnerCompat(desc);
    expect(result.compatible).toBe(false);
    expect(result.errors.some((e) => e.includes("implement"))).toBe(true);
  });

  it("warns when reasoning levels are empty", () => {
    const desc: RunnerDescription = {
      version: "1.0.0",
      contractVersion: 1,
      supportedPhases: ["triage", "plan", "implement", "verify", "review", "repair"],
      availableProviders: ["anthropic"],
      supportedApprovalModes: ["suggest"],
      supportedReasoningLevels: [],
    };
    const result = validateRunnerCompat(desc);
    expect(result.compatible).toBe(true);
    expect(result.warnings.some((w) => w.includes("reasoning"))).toBe(true);
  });

  it("warns on old contract version", () => {
    const desc: RunnerDescription = {
      version: "0.9.0",
      contractVersion: 0,
      supportedPhases: ["triage", "plan", "implement", "verify", "review", "repair"],
      availableProviders: ["anthropic"],
      supportedApprovalModes: ["suggest"],
      supportedReasoningLevels: ["low"],
    };
    const result = validateRunnerCompat(desc);
    expect(result.compatible).toBe(true);
    expect(result.warnings.some((w) => w.includes("contract version"))).toBe(true);
  });
});
