import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { StateStore } from "../state/store.js";
describe("StateStore", () => {
    let store;
    let tmpDir;
    function createStore() {
        tmpDir = mkdtempSync(join(tmpdir(), "state-test-"));
        store = new StateStore(join(tmpDir, "test.db"));
        return store;
    }
    afterEach(() => {
        try {
            store?.close();
        }
        catch {
            // ignore
        }
        if (tmpDir) {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });
    it("creates and retrieves a workflow run", () => {
        createStore();
        const run = store.createWorkflowRun({
            issueNumber: 42,
            issueUrl: "https://github.com/org/repo/issues/42",
            repo: "org/repo",
            metadata: { priority: "high" },
        });
        expect(run.id).toBeDefined();
        expect(run.issueNumber).toBe(42);
        expect(run.issueUrl).toBe("https://github.com/org/repo/issues/42");
        expect(run.repo).toBe("org/repo");
        expect(run.status).toBe("new");
        expect(run.repairRound).toBe(0);
        expect(run.metadata).toEqual({ priority: "high" });
        expect(run.branch).toBeNull();
        expect(run.prNumber).toBeNull();
        const fetched = store.getWorkflowRun(run.id);
        expect(fetched).toEqual(run);
    });
    it("transitions status with audit trail", () => {
        createStore();
        const run = store.createWorkflowRun({
            issueNumber: 1,
            issueUrl: "https://github.com/org/repo/issues/1",
            repo: "org/repo",
        });
        const updated = store.updateStatus(run.id, "triaged", "issue analyzed");
        expect(updated.status).toBe("triaged");
        store.updateStatus(run.id, "plan_draft", "generating plan");
        const transitions = store.getTransitions(run.id);
        expect(transitions).toHaveLength(2);
        expect(transitions[0].from).toBe("new");
        expect(transitions[0].to).toBe("triaged");
        expect(transitions[0].reason).toBe("issue analyzed");
        expect(transitions[1].from).toBe("triaged");
        expect(transitions[1].to).toBe("plan_draft");
        expect(transitions[1].reason).toBe("generating plan");
    });
    it("creates and completes agent runs", () => {
        createStore();
        const wf = store.createWorkflowRun({
            issueNumber: 5,
            issueUrl: "https://github.com/org/repo/issues/5",
            repo: "org/repo",
        });
        const agent = store.createAgentRun({
            workflowRunId: wf.id,
            phase: "plan",
            inputPath: "/tmp/input.json",
        });
        expect(agent.status).toBe("running");
        expect(agent.phase).toBe("plan");
        expect(agent.inputPath).toBe("/tmp/input.json");
        expect(agent.finishedAt).toBeNull();
        const completed = store.completeAgentRun(agent.id, {
            status: "success",
            outputPath: "/tmp/output.json",
            iterations: 3,
            costUsd: 0.15,
        });
        expect(completed.status).toBe("success");
        expect(completed.finishedAt).toBeDefined();
        expect(completed.outputPath).toBe("/tmp/output.json");
        expect(completed.iterations).toBe(3);
        expect(completed.costUsd).toBe(0.15);
    });
    it("lists by status", () => {
        createStore();
        store.createWorkflowRun({
            issueNumber: 1,
            issueUrl: "https://github.com/org/repo/issues/1",
            repo: "org/repo",
        });
        store.createWorkflowRun({
            issueNumber: 2,
            issueUrl: "https://github.com/org/repo/issues/2",
            repo: "org/repo",
        });
        const newRuns = store.listByStatus("new");
        expect(newRuns).toHaveLength(2);
        const triagedRuns = store.listByStatus("triaged");
        expect(triagedRuns).toHaveLength(0);
    });
    it("finds by issue", () => {
        createStore();
        store.createWorkflowRun({
            issueNumber: 10,
            issueUrl: "https://github.com/org/repo/issues/10",
            repo: "org/repo",
        });
        const found = store.getWorkflowRunByIssue("org/repo", 10);
        expect(found).toBeDefined();
        expect(found.issueNumber).toBe(10);
        const notFound = store.getWorkflowRunByIssue("org/repo", 999);
        expect(notFound).toBeUndefined();
    });
    it("updates workflow run fields", async () => {
        createStore();
        const run = store.createWorkflowRun({
            issueNumber: 7,
            issueUrl: "https://github.com/org/repo/issues/7",
            repo: "org/repo",
        });
        // Ensure a different timestamp
        await new Promise((r) => setTimeout(r, 10));
        const updated = store.updateWorkflowRun(run.id, {
            branch: "fix/issue-7",
            prNumber: 123,
            prUrl: "https://github.com/org/repo/pull/123",
            worktreePath: "/tmp/wt",
            currentPhase: "implement",
            repairRound: 2,
            metadata: { attempt: 2 },
        });
        expect(updated.branch).toBe("fix/issue-7");
        expect(updated.prNumber).toBe(123);
        expect(updated.prUrl).toBe("https://github.com/org/repo/pull/123");
        expect(updated.worktreePath).toBe("/tmp/wt");
        expect(updated.currentPhase).toBe("implement");
        expect(updated.repairRound).toBe(2);
        expect(updated.metadata).toEqual({ attempt: 2 });
        expect(updated.updatedAt).not.toBe(run.updatedAt);
    });
});
