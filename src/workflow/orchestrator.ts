import type { StateStore } from "../state/store.js";
import type { GitHubGateway } from "../github/gateway.js";
import type { WorkflowConfig } from "./config.js";
import type { WorkflowRun } from "../state/types.js";
import type { LaunchResult } from "../runner/launcher.js";
import { defaultConfig } from "./config.js";

export interface OrchestratorDeps {
  store: StateStore;
  github: GitHubGateway;
  launcher: { launch(params: { phase: string; repoPath: string; runId: string; input: unknown }): LaunchResult };
  repo: string;
  repoRoot?: string;
  config?: WorkflowConfig;
}

export class WorkflowOrchestrator {
  private store: StateStore;
  private github: GitHubGateway;
  private launcher: OrchestratorDeps["launcher"];
  private repo: string;
  private repoRoot: string;
  private config: WorkflowConfig;

  constructor(deps: OrchestratorDeps) {
    this.store = deps.store;
    this.github = deps.github;
    this.launcher = deps.launcher;
    this.repo = deps.repo;
    this.repoRoot = deps.repoRoot ?? ".";
    this.config = deps.config ?? defaultConfig();
  }

  async triage(issueNumber: number): Promise<WorkflowRun> {
    // 1. Fetch issue from GitHub
    const issue = await this.github.fetchIssue(this.repo, issueNumber);

    // 2. Create workflow run (status="new")
    const workflowRun = this.store.createWorkflowRun({
      issueNumber: issue.number,
      issueUrl: issue.url,
      repo: this.repo,
      metadata: { title: issue.title },
    });

    // 3. Create agent run for triage phase
    const agentRun = this.store.createAgentRun({
      workflowRunId: workflowRun.id,
      phase: "triage",
    });

    // 4. Launch triage via launcher
    const result = this.launcher.launch({
      phase: "triage",
      repoPath: this.repoRoot,
      runId: agentRun.id,
      input: {
        issueNumber: issue.number,
        title: issue.title,
        body: issue.body,
        labels: [...issue.labels],
        author: issue.author,
      },
    });

    // 5. Complete agent run with success/failed
    const agentStatus = result.exitCode === 0 ? "success" : "failed";
    this.store.completeAgentRun(agentRun.id, {
      status: agentStatus,
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });

    // 6. On failure: update status to "failed", post failure comment, add "da:blocked" label
    if (agentStatus === "failed") {
      this.store.updateStatus(workflowRun.id, "failed", "Triage agent failed");
      await this.github.addComment(
        this.repo,
        issueNumber,
        `**DevAgent triage failed.**\nThe triage agent exited with code ${result.exitCode}. This issue has been marked as blocked.`,
      );
      await this.github.addLabels(this.repo, issueNumber, ["da:blocked"]);
      return this.store.getWorkflowRun(workflowRun.id)!;
    }

    // 7. On success: post triage summary comment, update status to "triaged",
    //    add "da:triaged" label, remove "da:ready"
    const output = result.output as Record<string, unknown> | null;
    const summary = output?.summary ?? "Triage completed successfully.";
    await this.github.addComment(
      this.repo,
      issueNumber,
      `**DevAgent Triage Summary**\n${summary}`,
    );
    this.store.updateStatus(workflowRun.id, "triaged", "Triage completed");
    await this.github.addLabels(this.repo, issueNumber, ["da:triaged"]);
    await this.github.removeLabels(this.repo, issueNumber, ["da:ready"]);

    // 8. Return updated workflow run
    return this.store.getWorkflowRun(workflowRun.id)!;
  }
}
