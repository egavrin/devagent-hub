import { describe, it, expect, beforeEach } from "vitest";
import { MockRunLauncher } from "../runner/mock-launcher.js";
describe("MockRunLauncher", () => {
    let launcher;
    beforeEach(() => {
        launcher = new MockRunLauncher();
    });
    it("records launches and returns configured responses", () => {
        launcher.setResponse("plan", { exitCode: 0, output: { plan: "do stuff" } });
        const result = launcher.launch({
            phase: "plan",
            repoPath: "/tmp/repo",
            runId: "run-1",
            input: { issue: 42 },
        });
        expect(result.exitCode).toBe(0);
        expect(result.output).toEqual({ plan: "do stuff" });
        expect(result.outputPath).toBe("/tmp/mock/run-1/plan-output.json");
        expect(result.eventsPath).toBe("/tmp/mock/run-1/plan-events.jsonl");
        expect(launcher.launches).toHaveLength(1);
        expect(launcher.launches[0].phase).toBe("plan");
        expect(launcher.launches[0].runId).toBe("run-1");
    });
    it("returns default success for unconfigured phases", () => {
        const result = launcher.launch({
            phase: "implement",
            repoPath: "/tmp/repo",
            runId: "run-2",
            input: {},
        });
        expect(result.exitCode).toBe(0);
        expect(result.output).toEqual({
            schemaVersion: 1,
            phase: "implement",
            result: {},
            summary: "Mock result",
        });
    });
    it("records input data correctly", () => {
        const input = { issue: 99, title: "Fix the bug", labels: ["urgent"] };
        launcher.launch({
            phase: "plan",
            repoPath: "/home/user/project",
            runId: "run-3",
            input,
        });
        expect(launcher.launches).toHaveLength(1);
        expect(launcher.launches[0]).toEqual({
            phase: "plan",
            repoPath: "/home/user/project",
            runId: "run-3",
            input: { issue: 99, title: "Fix the bug", labels: ["urgent"] },
        });
    });
    it("returns configured error exit code", () => {
        launcher.setResponse("validate", {
            exitCode: 1,
            output: { error: "validation failed" },
        });
        const result = launcher.launch({
            phase: "validate",
            repoPath: "/tmp/repo",
            runId: "run-4",
            input: {},
        });
        expect(result.exitCode).toBe(1);
        expect(result.output).toEqual({ error: "validation failed" });
    });
});
