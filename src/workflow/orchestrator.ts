import type { StateStore } from "../state/store.js";
import type { GitHubGateway } from "../github/gateway.js";
import type { WorkflowConfig } from "./config.js";
import type { WorkflowRun } from "../state/types.js";
import type { LaunchResult } from "../runner/launcher.js";
import type { WorktreeManager } from "../workspace/worktree-manager.js";
import { defaultConfig } from "./config.js";

export interface OrchestratorDeps {
  store: StateStore;
  github: GitHubGateway;
  launcher: { launch(params: { phase: string; repoPath: string; runId: string; input: unknown }): LaunchResult };
  repo: string;
  repoRoot?: string;
  config?: WorkflowConfig;
  worktreeManager?: WorktreeManager;
}

export class WorkflowOrchestrator {
  private store: StateStore;
  private github: GitHubGateway;
  private launcher: OrchestratorDeps["launcher"];
  private repo: string;
  private repoRoot: string;
  private config: WorkflowConfig;
  private worktreeManager?: WorktreeManager;

  constructor(deps: OrchestratorDeps) {
    this.store = deps.store;
    this.github = deps.github;
    this.launcher = deps.launcher;
    this.repo = deps.repo;
    this.repoRoot = deps.repoRoot ?? ".";
    this.config = deps.config ?? defaultConfig();
    this.worktreeManager = deps.worktreeManager;
  }

  private setupWorktree(issueNumber: number, wfRunId: string): string {
    if (!this.worktreeManager) return this.repoRoot;
    const wt = this.worktreeManager.create(issueNumber, this.repoRoot);
    this.store.updateWorkflowRun(wfRunId, { branch: wt.branch, worktreePath: wt.path });
    return wt.path;
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

  async plan(issueNumber: number): Promise<WorkflowRun> {
    // 1. Fetch the workflow run by issue
    const workflowRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!workflowRun) {
      throw new Error(`No workflow run found for issue ${issueNumber}`);
    }

    // 2. Check status is "triaged"
    if (workflowRun.status !== "triaged") {
      throw new Error(
        `Cannot plan issue ${issueNumber}: expected status "triaged" but got "${workflowRun.status}"`,
      );
    }

    // 3. Fetch the issue from GitHub
    const issue = await this.github.fetchIssue(this.repo, issueNumber);

    // 4. Create agent run for plan phase
    const agentRun = this.store.createAgentRun({
      workflowRunId: workflowRun.id,
      phase: "plan",
    });

    // 5. Launch plan phase via launcher
    const result = this.launcher.launch({
      phase: "plan",
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

    // 6. Complete agent run
    const agentStatus = result.exitCode === 0 ? "success" : "failed";
    this.store.completeAgentRun(agentRun.id, {
      status: agentStatus,
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });

    // 7. On failure: transition to "failed", post failure comment
    if (agentStatus === "failed") {
      this.store.updateStatus(workflowRun.id, "failed", "Plan agent failed");
      await this.github.addComment(
        this.repo,
        issueNumber,
        `**DevAgent plan failed.**\nThe plan agent exited with code ${result.exitCode}. This issue has been marked as failed.`,
      );
      return this.store.getWorkflowRun(workflowRun.id)!;
    }

    // 8. On success: post plan summary with approval prompt, transition to "plan_draft"
    const output = result.output as Record<string, unknown> | null;
    const summary = output?.summary ?? "Plan created successfully.";
    await this.github.addComment(
      this.repo,
      issueNumber,
      `**DevAgent Plan Summary**\n${summary}\n\nReply with feedback or \`/approve\` to proceed.`,
    );
    this.store.updateStatus(workflowRun.id, "plan_draft", "Plan completed");
    this.store.updateWorkflowRun(workflowRun.id, { currentPhase: "plan" });

    return this.store.getWorkflowRun(workflowRun.id)!;
  }

  async approvePlan(issueNumber: number): Promise<WorkflowRun> {
    const workflowRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!workflowRun) {
      throw new Error(`No workflow run found for issue ${issueNumber}`);
    }

    if (workflowRun.status !== "plan_draft" && workflowRun.status !== "plan_revision") {
      throw new Error(
        `Cannot approve plan for issue ${issueNumber}: expected status "plan_draft" or "plan_revision" but got "${workflowRun.status}"`,
      );
    }

    this.store.updateStatus(workflowRun.id, "plan_accepted", "Plan approved");
    await this.github.addComment(
      this.repo,
      issueNumber,
      `**Plan approved.** Proceeding to implementation.`,
    );

    return this.store.getWorkflowRun(workflowRun.id)!;
  }

  async triageAndPlan(issueNumber: number): Promise<WorkflowRun> {
    const triageResult = await this.triage(issueNumber);
    if (triageResult.status === "failed") {
      return triageResult;
    }
    return this.plan(issueNumber);
  }

  async implement(issueNumber: number): Promise<WorkflowRun> {
    // 1. Get workflow run, check status is "plan_accepted"
    const workflowRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!workflowRun) {
      throw new Error(`No workflow run found for issue ${issueNumber}`);
    }
    if (workflowRun.status !== "plan_accepted") {
      throw new Error(
        `Cannot implement issue ${issueNumber}: expected status "plan_accepted" but got "${workflowRun.status}"`,
      );
    }

    // 2. Transition to "implementing", set currentPhase
    this.store.updateStatus(workflowRun.id, "implementing", "Starting implementation");
    this.store.updateWorkflowRun(workflowRun.id, { currentPhase: "implement" });

    // 3. Setup worktree (creates branch da/issue-N)
    const workDir = this.setupWorktree(issueNumber, workflowRun.id);

    // 4. Fetch issue for context
    const issue = await this.github.fetchIssue(this.repo, issueNumber);

    // 5. Create agent run for "implement"
    const agentRun = this.store.createAgentRun({
      workflowRunId: workflowRun.id,
      phase: "implement",
    });

    // 6. Launch implement phase in worktree dir
    const result = this.launcher.launch({
      phase: "implement",
      repoPath: workDir,
      runId: agentRun.id,
      input: {
        issueNumber: issue.number,
        title: issue.title,
        body: issue.body,
        labels: [...issue.labels],
        author: issue.author,
      },
    });

    // 7. Complete agent run
    const agentStatus = result.exitCode === 0 ? "success" : "failed";
    this.store.completeAgentRun(agentRun.id, {
      status: agentStatus,
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });

    // 8. On failure: transition to "failed", post comment
    if (agentStatus === "failed") {
      this.store.updateStatus(workflowRun.id, "failed", "Implement agent failed");
      await this.github.addComment(
        this.repo,
        issueNumber,
        `**DevAgent implementation failed.**\nThe implement agent exited with code ${result.exitCode}. This issue has been marked as failed.`,
      );
      return this.store.getWorkflowRun(workflowRun.id)!;
    }

    // 9. On success: return updated run (stays in "implementing")
    return this.store.getWorkflowRun(workflowRun.id)!;
  }

  async verify(issueNumber: number): Promise<WorkflowRun> {
    // 1. Get workflow run
    const workflowRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!workflowRun) {
      throw new Error(`No workflow run found for issue ${issueNumber}`);
    }

    // 2. Use worktreePath or repoRoot as workDir
    const workDir = workflowRun.worktreePath ?? this.repoRoot;

    // 3. Create agent run for "verify"
    const agentRun = this.store.createAgentRun({
      workflowRunId: workflowRun.id,
      phase: "verify",
    });

    // 4. Launch verify phase with verify commands as input
    const result = this.launcher.launch({
      phase: "verify",
      repoPath: workDir,
      runId: agentRun.id,
      input: { commands: this.config.verify.commands },
    });

    // 5. Complete agent run
    const agentStatus = result.exitCode === 0 ? "success" : "failed";
    this.store.completeAgentRun(agentRun.id, {
      status: agentStatus,
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });

    if (agentStatus === "failed") {
      this.store.updateStatus(workflowRun.id, "failed", "Verify agent failed");
      await this.github.addComment(
        this.repo,
        issueNumber,
        `**DevAgent verification failed.**\nThe verify agent exited with code ${result.exitCode}.`,
      );
      return this.store.getWorkflowRun(workflowRun.id)!;
    }

    // 6. Transition to "awaiting_local_verify"
    this.store.updateStatus(workflowRun.id, "awaiting_local_verify", "Verification passed");

    // 7. Return updated run
    return this.store.getWorkflowRun(workflowRun.id)!;
  }

  async openPR(issueNumber: number): Promise<WorkflowRun> {
    // 1. Get workflow run, check status
    const workflowRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!workflowRun) {
      throw new Error(`No workflow run found for issue ${issueNumber}`);
    }

    if (workflowRun.status !== "awaiting_local_verify") {
      throw new Error(
        `Cannot open PR for issue ${issueNumber}: expected status "awaiting_local_verify" but got "${workflowRun.status}"`,
      );
    }

    // 2. Get branch from run or default
    const branch = workflowRun.branch ?? `da/issue-${issueNumber}`;
    const workDir = workflowRun.worktreePath ?? this.repoRoot;

    // 3. Push branch
    await this.github.pushBranch(workDir, branch);

    // 4. Fetch issue for title
    const issue = await this.github.fetchIssue(this.repo, issueNumber);

    // 5. Create draft PR
    const pr = await this.github.createPR(this.repo, {
      title: `[DevAgent] ${issue.title}`,
      body: `Closes #${issueNumber}`,
      head: branch,
      base: "main",
      draft: this.config.pr.draft,
    });

    // 6. Update run with prNumber and prUrl
    this.store.updateWorkflowRun(workflowRun.id, {
      prNumber: pr.number,
      prUrl: pr.url,
    });

    // 7. Transition to "draft_pr_opened"
    this.store.updateStatus(workflowRun.id, "draft_pr_opened", "Draft PR opened");

    // 8. Post comment about PR opened
    await this.github.addComment(
      this.repo,
      issueNumber,
      `**DevAgent opened a draft PR:** [#${pr.number}](${pr.url})`,
    );

    // 9. Add "da:pr-open" label
    await this.github.addLabels(this.repo, issueNumber, ["da:pr-open"]);

    return this.store.getWorkflowRun(workflowRun.id)!;
  }

  async implementAndPR(issueNumber: number): Promise<WorkflowRun> {
    let run = await this.implement(issueNumber);
    if (run.status === "failed") return run;
    run = await this.verify(issueNumber);
    if (run.status === "awaiting_local_verify") {
      run = await this.openPR(issueNumber);
    }
    return run;
  }

  async review(issueNumber: number): Promise<WorkflowRun> {
    const wfRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!wfRun) throw new Error(`No workflow run for issue #${issueNumber}`);
    if (wfRun.status !== "draft_pr_opened") {
      throw new Error(`Cannot review: status is ${wfRun.status}`);
    }

    const workDir = wfRun.worktreePath ?? this.repoRoot;

    const agentRun = this.store.createAgentRun({
      workflowRunId: wfRun.id,
      phase: "review",
    });

    const result = this.launcher.launch({
      phase: "review",
      repoPath: workDir,
      runId: agentRun.id,
      input: {
        issueNumber,
        prNumber: wfRun.prNumber,
        branch: wfRun.branch,
      },
    });

    this.store.completeAgentRun(agentRun.id, {
      status: result.exitCode === 0 ? "success" : "failed",
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });

    if (result.exitCode !== 0) {
      this.store.updateStatus(wfRun.id, "failed", "Review phase failed");
      return this.store.getWorkflowRun(wfRun.id)!;
    }

    const output = result.output as Record<string, unknown> | null;
    const resultData = output?.result as Record<string, unknown> | undefined;
    const verdict = resultData?.verdict ?? "pass";
    const blockingCount = (resultData?.blockingCount as number) ?? 0;
    const summary = (output?.summary as string) ?? "Review complete.";

    await this.github.addComment(
      this.repo, issueNumber,
      `**Auto Review**\n\n${summary}`
    );

    if (verdict === "block" || blockingCount > 0) {
      this.store.updateStatus(wfRun.id, "auto_review_fix_loop", `Review found ${blockingCount} blocking issues`);
      this.store.updateWorkflowRun(wfRun.id, { currentPhase: "review" });
    } else {
      this.store.updateStatus(wfRun.id, "awaiting_human_review", "Auto review passed");
      await this.github.addLabels(this.repo, issueNumber, ["da:awaiting-human"]);
      await this.github.addComment(
        this.repo, issueNumber,
        "**Auto review passed.** Ready for human review."
      );
    }

    return this.store.getWorkflowRun(wfRun.id)!;
  }

  async repair(issueNumber: number): Promise<WorkflowRun> {
    const wfRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!wfRun) throw new Error(`No workflow run for issue #${issueNumber}`);
    if (wfRun.status !== "auto_review_fix_loop") {
      throw new Error(`Cannot repair: status is ${wfRun.status}`);
    }

    const maxRounds = this.config.repair.max_rounds;
    const currentRound = wfRun.repairRound + 1;

    if (currentRound > maxRounds) {
      this.store.updateStatus(wfRun.id, "escalated", `Exceeded max repair rounds (${maxRounds})`);
      await this.github.addComment(
        this.repo, issueNumber,
        `**Escalated.** Repair loop exceeded ${maxRounds} rounds. Human intervention needed.`
      );
      await this.github.addLabels(this.repo, issueNumber, ["da:escalated"]);
      return this.store.getWorkflowRun(wfRun.id)!;
    }

    const workDir = wfRun.worktreePath ?? this.repoRoot;

    const agentRun = this.store.createAgentRun({
      workflowRunId: wfRun.id,
      phase: "repair",
    });

    const result = this.launcher.launch({
      phase: "repair",
      repoPath: workDir,
      runId: agentRun.id,
      input: {
        round: currentRound,
        issueNumber,
        prNumber: wfRun.prNumber,
      },
    });

    this.store.completeAgentRun(agentRun.id, {
      status: result.exitCode === 0 ? "success" : "failed",
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });

    this.store.updateWorkflowRun(wfRun.id, {
      repairRound: currentRound,
      currentPhase: "repair",
    });

    if (result.exitCode !== 0) {
      this.store.updateStatus(wfRun.id, "failed", `Repair round ${currentRound} failed`);
      return this.store.getWorkflowRun(wfRun.id)!;
    }

    const output = result.output as Record<string, unknown> | null;
    const resultData = output?.result as Record<string, unknown> | undefined;
    const remainingFindings = (resultData?.remainingFindings as number) ?? 0;
    const verificationPassed = (resultData?.verificationPassed as boolean) ?? true;
    const summary = (output?.summary as string) ?? `Repair round ${currentRound} complete.`;

    await this.github.addComment(
      this.repo, issueNumber,
      `**Repair Round ${currentRound}**\n\n${summary}`
    );

    // If repair didn't fully resolve issues and we've hit the max, escalate
    if (currentRound >= maxRounds && (remainingFindings > 0 || !verificationPassed)) {
      this.store.updateStatus(wfRun.id, "escalated", `Repair failed after ${maxRounds} rounds`);
      await this.github.addComment(
        this.repo, issueNumber,
        `**Escalated.** Repair loop failed after ${maxRounds} rounds. Human intervention needed.`
      );
      await this.github.addLabels(this.repo, issueNumber, ["da:escalated"]);
      return this.store.getWorkflowRun(wfRun.id)!;
    }

    // Transition back to draft_pr_opened for re-review
    this.store.updateStatus(wfRun.id, "draft_pr_opened", `Repair round ${currentRound} complete, ready for re-review`);

    return this.store.getWorkflowRun(wfRun.id)!;
  }
}
