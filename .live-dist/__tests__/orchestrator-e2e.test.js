// src/__tests__/orchestrator-e2e.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import { StateStore } from "../state/store.js";
import { MockGitHubGateway } from "../github/mock-gateway.js";
import { MockRunLauncher } from "../runner/mock-launcher.js";
import { unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
function makeIssue(n) {
    return {
        number: n, title: `Issue ${n}: Fix the thing`, body: "Description",
        labels: ["da:ready"], url: `https://github.com/org/repo/issues/${n}`,
        state: "open", author: "user", createdAt: new Date().toISOString(), comments: [],
    };
}
describe("WorkflowOrchestrator — end-to-end", () => {
    let store;
    let github;
    let launcher;
    let orchestrator;
    let dbPath;
    beforeEach(() => {
        dbPath = join(tmpdir(), `hub-e2e-test-${Date.now()}.db`);
        store = new StateStore(dbPath);
        github = new MockGitHubGateway();
        launcher = new MockRunLauncher();
        orchestrator = new WorkflowOrchestrator({ store, github, launcher, repo: "org/repo" });
    });
    afterEach(() => {
        store.close();
        try {
            unlinkSync(dbPath);
        }
        catch { }
    });
    it("runs full workflow: triage → plan → implement → verify → PR → review → handoff", async () => {
        github.seedIssue("org/repo", makeIssue(100));
        launcher.setResponse("triage", { exitCode: 0, output: { summary: "Small bug" } });
        launcher.setResponse("plan", { exitCode: 0, output: { summary: "Fix src/a.ts" } });
        launcher.setResponse("implement", { exitCode: 0, output: { summary: "Fixed" } });
        launcher.setResponse("verify", {
            exitCode: 0,
            output: { result: { allPassed: true }, summary: "All pass" },
        });
        launcher.setResponse("review", {
            exitCode: 0,
            output: { findings: [], blockingCount: 0, verdict: "pass", summary: "Clean" },
        });
        const run = await orchestrator.runWorkflow(100, { autoApprove: true });
        expect(run.status).toBe("awaiting_human_review");
        // Verify the full audit trail
        const transitions = store.getTransitions(run.id);
        const statuses = transitions.map((t) => t.to);
        expect(statuses).toContain("triaged");
        expect(statuses).toContain("plan_draft");
        expect(statuses).toContain("plan_accepted");
        expect(statuses).toContain("implementing");
        expect(statuses).toContain("awaiting_local_verify");
        expect(statuses).toContain("draft_pr_opened");
        expect(statuses).toContain("awaiting_human_review");
        // Verify GitHub comments were posted
        const issue = github.issues.get("org/repo#100");
        expect(issue.comments.length).toBeGreaterThanOrEqual(4);
        // Verify PR was created
        expect(github.prs.size).toBe(1);
    });
    it("runs workflow with repair loop", async () => {
        github.seedIssue("org/repo", makeIssue(101));
        launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
        launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
        launcher.setResponse("implement", { exitCode: 0, output: { summary: "Done" } });
        launcher.setResponse("verify", {
            exitCode: 0,
            output: { result: { allPassed: true }, summary: "Pass" },
        });
        // First review finds issues, repair fixes them, second review passes
        let reviewCount = 0;
        const origLaunch = launcher.launch.bind(launcher);
        launcher.launch = (params) => {
            if (params.phase === "review") {
                reviewCount++;
                if (reviewCount === 1) {
                    launcher.launches.push(params);
                    return {
                        exitCode: 0,
                        outputPath: `/tmp/mock/${params.runId}/review-output.json`,
                        eventsPath: `/tmp/mock/${params.runId}/review-events.jsonl`,
                        output: { findings: [{ severity: "blocking", file: "a.ts", message: "Bug" }], blockingCount: 1, verdict: "block", summary: "1 issue" },
                    };
                }
                launcher.launches.push(params);
                return {
                    exitCode: 0,
                    outputPath: `/tmp/mock/${params.runId}/review-output.json`,
                    eventsPath: `/tmp/mock/${params.runId}/review-events.jsonl`,
                    output: { findings: [], blockingCount: 0, verdict: "pass", summary: "Clean" },
                };
            }
            return origLaunch(params);
        };
        launcher.setResponse("repair", {
            exitCode: 0,
            output: { fixedFindings: ["Fixed bug in a.ts"], remainingFindings: 0, changedFiles: ["a.ts"], verificationPassed: true, summary: "Fixed" },
        });
        const run = await orchestrator.runWorkflow(101, { autoApprove: true });
        expect(run.status).toBe("awaiting_human_review");
        expect(run.repairRound).toBe(1);
    });
    it("stops at plan_draft when autoApprove is false", async () => {
        github.seedIssue("org/repo", makeIssue(103));
        launcher.setResponse("triage", { exitCode: 0, output: { summary: "OK" } });
        launcher.setResponse("plan", { exitCode: 0, output: { summary: "Plan" } });
        const run = await orchestrator.runWorkflow(103);
        expect(run.status).toBe("plan_draft");
    });
    it("returns failed when triage fails", async () => {
        github.seedIssue("org/repo", makeIssue(102));
        launcher.setResponse("triage", { exitCode: 1, output: null });
        const run = await orchestrator.runWorkflow(102, { autoApprove: true });
        expect(run.status).toBe("failed");
    });
});
