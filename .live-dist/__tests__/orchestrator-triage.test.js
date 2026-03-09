import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StateStore } from "../state/store.js";
import { MockGitHubGateway } from "../github/mock-gateway.js";
import { MockRunLauncher } from "../runner/mock-launcher.js";
import { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import { unlinkSync } from "fs";
import { randomUUID } from "crypto";
const REPO = "test-org/test-repo";
function makeIssue(overrides = {}) {
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
describe("WorkflowOrchestrator.triage", () => {
    let store;
    let github;
    let launcher;
    let orchestrator;
    let dbPath;
    beforeEach(() => {
        dbPath = `/tmp/test-orch-triage-${randomUUID()}.sqlite`;
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
        try {
            unlinkSync(dbPath);
        }
        catch { }
    });
    it("runs triage and posts summary to GitHub", async () => {
        const issue = makeIssue();
        github.seedIssue(REPO, issue);
        launcher.setResponse("triage", {
            exitCode: 0,
            output: {
                schemaVersion: 1,
                phase: "triage",
                result: {},
                summary: "Issue is a valid bug report affecting mobile login.",
            },
        });
        const run = await orchestrator.triage(42);
        // Workflow run should be triaged
        expect(run.status).toBe("triaged");
        expect(run.issueNumber).toBe(42);
        expect(run.repo).toBe(REPO);
        // A comment should have been posted with the summary
        const updatedIssue = await github.fetchIssue(REPO, 42);
        expect(updatedIssue.comments).toHaveLength(1);
        expect(updatedIssue.comments[0].body).toContain("DevAgent Triage Summary");
        expect(updatedIssue.comments[0].body).toContain("valid bug report");
        // Labels should be updated: da:triaged added, da:ready removed
        expect(updatedIssue.labels).toContain("da:triaged");
        expect(updatedIssue.labels).toContain("bug");
        expect(updatedIssue.labels).not.toContain("da:ready");
    });
    it("handles triage failure gracefully", async () => {
        const issue = makeIssue();
        github.seedIssue(REPO, issue);
        launcher.setResponse("triage", {
            exitCode: 1,
            output: { error: "Agent crashed" },
        });
        const run = await orchestrator.triage(42);
        // Status should be failed
        expect(run.status).toBe("failed");
        // A failure comment should have been posted
        const updatedIssue = await github.fetchIssue(REPO, 42);
        expect(updatedIssue.comments).toHaveLength(1);
        expect(updatedIssue.comments[0].body).toContain("triage failed");
        // da:blocked label should be added
        expect(updatedIssue.labels).toContain("da:blocked");
    });
    it("creates agent run record and calls launcher with correct input", async () => {
        const issue = makeIssue();
        github.seedIssue(REPO, issue);
        await orchestrator.triage(42);
        // Launcher should have been called exactly once
        expect(launcher.launches).toHaveLength(1);
        const launch = launcher.launches[0];
        expect(launch.phase).toBe("triage");
        expect(launch.repoPath).toBe("/tmp/test-repo");
        // Input should contain issue details
        const input = launch.input;
        expect(input.issueNumber).toBe(42);
        expect(input.title).toBe("Fix login bug");
        expect(input.body).toBe("The login form breaks on mobile");
        expect(input.labels).toEqual(["da:ready", "bug"]);
        expect(input.author).toBe("alice");
        // Agent run should exist in the store with success status
        const workflowRun = store.getWorkflowRunByIssue(REPO, 42);
        expect(workflowRun).toBeDefined();
    });
});
