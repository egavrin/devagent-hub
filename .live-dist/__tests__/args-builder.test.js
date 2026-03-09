import { describe, it, expect } from "vitest";
import { buildLaunchArgs, validatePhase, validateApprovalMode, validateReasoningLevel, InvalidLaunchConfigError, } from "../runner/args-builder.js";
describe("validatePhase", () => {
    it("accepts valid phases", () => {
        for (const phase of ["triage", "plan", "implement", "verify", "review", "repair"]) {
            expect(() => validatePhase(phase)).not.toThrow();
        }
    });
    it("rejects invalid phases", () => {
        expect(() => validatePhase("analyze")).toThrow(InvalidLaunchConfigError);
        expect(() => validatePhase("")).toThrow(InvalidLaunchConfigError);
        expect(() => validatePhase("understand")).toThrow(InvalidLaunchConfigError);
    });
});
describe("validateApprovalMode", () => {
    it("accepts valid modes", () => {
        for (const mode of ["suggest", "auto-edit", "full-auto"]) {
            expect(() => validateApprovalMode(mode)).not.toThrow();
        }
    });
    it("rejects invalid modes", () => {
        expect(() => validateApprovalMode("auto")).toThrow(InvalidLaunchConfigError);
        expect(() => validateApprovalMode("manual")).toThrow(InvalidLaunchConfigError);
    });
});
describe("validateReasoningLevel", () => {
    it("accepts valid levels", () => {
        for (const level of ["low", "medium", "high", "xhigh"]) {
            expect(() => validateReasoningLevel(level)).not.toThrow();
        }
    });
    it("rejects invalid levels", () => {
        expect(() => validateReasoningLevel("ultra")).toThrow(InvalidLaunchConfigError);
        expect(() => validateReasoningLevel("none")).toThrow(InvalidLaunchConfigError);
    });
});
describe("buildLaunchArgs", () => {
    const baseParams = {
        phase: "triage",
        repoPath: "/repo",
        inputPath: "/artifacts/input.json",
        outputPath: "/artifacts/output.json",
        eventsPath: "/artifacts/events.jsonl",
    };
    it("builds minimal args", () => {
        const args = buildLaunchArgs(baseParams, {});
        expect(args).toEqual([
            "workflow", "run",
            "--phase", "triage",
            "--input", "/artifacts/input.json",
            "--output", "/artifacts/output.json",
            "--events", "/artifacts/events.jsonl",
            "--repo", "/repo",
        ]);
    });
    it("includes all optional args", () => {
        const args = buildLaunchArgs(baseParams, {
            provider: "anthropic",
            model: "claude-sonnet-4-6",
            maxIterations: 20,
            approvalMode: "full-auto",
            reasoning: "high",
            supportedReasoningLevels: ["low", "medium", "high", "xhigh"],
        });
        expect(args).toContain("--provider");
        expect(args).toContain("anthropic");
        expect(args).toContain("--model");
        expect(args).toContain("claude-sonnet-4-6");
        expect(args).toContain("--max-iterations");
        expect(args).toContain("20");
        expect(args).toContain("--approval");
        expect(args).toContain("full-auto");
        expect(args).toContain("--reasoning");
        expect(args).toContain("high");
    });
    it("uses --approval not --approval-mode", () => {
        const args = buildLaunchArgs(baseParams, { approvalMode: "suggest" });
        expect(args).toContain("--approval");
        expect(args).not.toContain("--approval-mode");
    });
    it("converts maxIterations=0 to 999999", () => {
        const args = buildLaunchArgs(baseParams, { maxIterations: 0 });
        expect(args).toContain("--max-iterations");
        expect(args).toContain("999999");
    });
    it("throws on invalid phase", () => {
        expect(() => buildLaunchArgs({ ...baseParams, phase: "analyze" }, {})).toThrow(InvalidLaunchConfigError);
    });
    it("throws on invalid approval mode", () => {
        expect(() => buildLaunchArgs(baseParams, { approvalMode: "auto" })).toThrow(InvalidLaunchConfigError);
    });
    it("throws on invalid reasoning level", () => {
        expect(() => buildLaunchArgs(baseParams, { reasoning: "ultra" })).toThrow(InvalidLaunchConfigError);
    });
});
