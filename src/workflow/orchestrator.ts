import type { StateStore } from "../state/store.js";
import type { GitHubGateway } from "../github/gateway.js";
import type { WorkflowConfig } from "./config.js";
import type { WorkflowRun } from "../state/types.js";
import type { LaunchResult } from "../runner/launcher.js";
import type { WorktreeManager } from "../workspace/worktree-manager.js";
import { defaultConfig } from "./config.js";
import { assertTransition } from "./state-machine.js";

/** Best-effort GitHub call — logs error but does not throw. */
async function safeGitHub<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[orchestrator] GitHub API error (non-fatal): ${msg}\n`);
    return fallback;
  }
}

export interface OrchestratorDeps {
  store: StateStore;
  github: GitHubGateway;
  launcher: { launch(params: { phase: string; repoPath: string; runId: string; input: unknown }): LaunchResult | Promise<LaunchResult> };
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
    const wt = this.worktreeManager.create(issueNumber, this.repoRoot, "main", wfRunId);
    this.store.updateWorkflowRun(wfRunId, { branch: wt.branch, worktreePath: wt.path });
    return wt.path;
  }

  private cleanupWorktree(issueNumber: number, wfRunId: string): void {
    if (!this.worktreeManager) return;
    try {
      this.worktreeManager.remove(issueNumber, this.repoRoot, false, wfRunId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[orchestrator] Worktree cleanup failed (non-fatal): ${msg}\n`);
    }
  }

  async triage(issueNumber: number): Promise<WorkflowRun> {
    const issue = await this.github.fetchIssue(this.repo, issueNumber);

    const workflowRun = this.store.createWorkflowRun({
      issueNumber: issue.number,
      issueUrl: issue.url,
      repo: this.repo,
      metadata: { title: issue.title },
    });

    const agentRun = this.store.createAgentRun({
      workflowRunId: workflowRun.id,
      phase: "triage",
    });
    this.store.updateWorkflowRun(workflowRun.id, { currentPhase: "triage" });

    const result = await this.launcher.launch({
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

    const agentStatus = result.exitCode === 0 ? "success" : "failed";
    this.store.completeAgentRun(agentRun.id, {
      status: agentStatus,
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });

    if (agentStatus === "failed") {
      this.store.updateStatus(workflowRun.id, "failed", "Triage agent failed");
      await safeGitHub(() => this.github.addComment(
        this.repo, issueNumber,
        `**DevAgent triage failed.**\nThe triage agent exited with code ${result.exitCode}. This issue has been marked as blocked.`,
      ), undefined);
      await safeGitHub(() => this.github.addLabels(this.repo, issueNumber, ["da:blocked"]), undefined);
      return this.store.getWorkflowRun(workflowRun.id)!;
    }

    // Store triage artifact
    const output = result.output as Record<string, unknown> | null;
    const summary = (output?.summary as string) ?? "Triage completed successfully.";
    this.store.createArtifact({
      workflowRunId: workflowRun.id,
      agentRunId: agentRun.id,
      type: "triage_report",
      phase: "triage",
      summary,
      data: output ?? {},
      filePath: result.outputPath,
    });

    await safeGitHub(() => this.github.addComment(
      this.repo, issueNumber,
      `**DevAgent Triage Summary**\n${summary}`,
    ), undefined);
    this.store.updateStatus(workflowRun.id, "triaged", "Triage completed");
    await safeGitHub(() => this.github.addLabels(this.repo, issueNumber, ["da:triaged"]), undefined);
    await safeGitHub(() => this.github.removeLabels(this.repo, issueNumber, ["da:ready"]), undefined);

    return this.store.getWorkflowRun(workflowRun.id)!;
  }

  async plan(issueNumber: number): Promise<WorkflowRun> {
    const workflowRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!workflowRun) {
      throw new Error(`No workflow run found for issue ${issueNumber}`);
    }

    if (workflowRun.status !== "triaged" && workflowRun.status !== "plan_revision") {
      throw new Error(
        `Cannot plan issue ${issueNumber}: expected status "triaged" or "plan_revision" but got "${workflowRun.status}"`,
      );
    }

    const issue = await this.github.fetchIssue(this.repo, issueNumber);

    // Load triage artifact to feed into plan
    const triageArtifact = this.store.getLatestArtifact(workflowRun.id, "triage_report");

    const agentRun = this.store.createAgentRun({
      workflowRunId: workflowRun.id,
      phase: "plan",
    });
    this.store.updateWorkflowRun(workflowRun.id, { currentPhase: "plan" });

    const result = await this.launcher.launch({
      phase: "plan",
      repoPath: this.repoRoot,
      runId: agentRun.id,
      input: {
        issueNumber: issue.number,
        title: issue.title,
        body: issue.body,
        labels: [...issue.labels],
        author: issue.author,
        triageReport: triageArtifact?.data,
      },
    });

    const agentStatus = result.exitCode === 0 ? "success" : "failed";
    this.store.completeAgentRun(agentRun.id, {
      status: agentStatus,
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });

    if (agentStatus === "failed") {
      this.store.updateStatus(workflowRun.id, "failed", "Plan agent failed");
      await safeGitHub(() => this.github.addComment(
        this.repo, issueNumber,
        `**DevAgent plan failed.**\nThe plan agent exited with code ${result.exitCode}. This issue has been marked as failed.`,
      ), undefined);
      return this.store.getWorkflowRun(workflowRun.id)!;
    }

    // Store plan artifact
    const output = result.output as Record<string, unknown> | null;
    const summary = (output?.summary as string) ?? "Plan created successfully.";
    this.store.createArtifact({
      workflowRunId: workflowRun.id,
      agentRunId: agentRun.id,
      type: "plan_draft",
      phase: "plan",
      summary,
      data: output ?? {},
      filePath: result.outputPath,
    });

    // Create approval request
    this.store.createApprovalRequest({
      workflowRunId: workflowRun.id,
      phase: "plan",
      summary,
    });

    await safeGitHub(() => this.github.addComment(
      this.repo, issueNumber,
      `**DevAgent Plan Summary**\n${summary}\n\nUse \`devagent-hub approve ${workflowRun.id}\` or reply with feedback.`,
    ), undefined);

    // Handle re-planning (plan_revision → plan_draft) vs first plan (triaged → plan_draft)
    if (workflowRun.status === "plan_revision") {
      this.store.updateStatus(workflowRun.id, "plan_draft", "Revised plan completed");
    } else {
      this.store.updateStatus(workflowRun.id, "plan_draft", "Plan completed");
    }

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

    // Resolve pending approval request
    const pending = this.store.getPendingApproval(workflowRun.id);
    if (pending) {
      this.store.resolveApprovalRequest(pending.id, "approve");
    }

    // Store accepted plan artifact (copy of the latest plan_draft)
    const planDraft = this.store.getLatestArtifact(workflowRun.id, "plan_draft");
    if (planDraft) {
      this.store.createArtifact({
        workflowRunId: workflowRun.id,
        type: "accepted_plan",
        phase: "plan",
        summary: planDraft.summary,
        data: planDraft.data,
        filePath: planDraft.filePath ?? undefined,
      });
    }

    this.store.updateStatus(workflowRun.id, "plan_accepted", "Plan approved");
    await safeGitHub(() => this.github.addComment(
      this.repo, issueNumber,
      `**Plan approved.** Proceeding to implementation.`,
    ), undefined);

    return this.store.getWorkflowRun(workflowRun.id)!;
  }

  async reworkPlan(issueNumber: number, note?: string): Promise<WorkflowRun> {
    const workflowRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!workflowRun) {
      throw new Error(`No workflow run found for issue ${issueNumber}`);
    }

    if (workflowRun.status !== "plan_draft") {
      throw new Error(
        `Cannot rework plan for issue ${issueNumber}: expected status "plan_draft" but got "${workflowRun.status}"`,
      );
    }

    // Resolve pending approval request as rework
    const pending = this.store.getPendingApproval(workflowRun.id);
    if (pending) {
      this.store.resolveApprovalRequest(pending.id, "rework", note);
    }

    this.store.updateStatus(workflowRun.id, "plan_revision", note ?? "Plan sent back for revision");
    await safeGitHub(() => this.github.addComment(
      this.repo, issueNumber,
      `**Plan revision requested.**${note ? `\n\nFeedback: ${note}` : ""}`,
    ), undefined);

    // Re-run plan phase
    return this.plan(issueNumber);
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

    const workDir = this.setupWorktree(issueNumber, workflowRun.id);
    const issue = await this.github.fetchIssue(this.repo, issueNumber);

    // Load accepted plan artifact
    const acceptedPlan = this.store.getLatestArtifact(workflowRun.id, "accepted_plan");

    const agentRun = this.store.createAgentRun({
      workflowRunId: workflowRun.id,
      phase: "implement",
    });

    const result = await this.launcher.launch({
      phase: "implement",
      repoPath: workDir,
      runId: agentRun.id,
      input: {
        issueNumber: issue.number,
        title: issue.title,
        body: issue.body,
        acceptedPlan: acceptedPlan?.data ?? {},
      },
    });

    const agentStatus = result.exitCode === 0 ? "success" : "failed";
    this.store.completeAgentRun(agentRun.id, {
      status: agentStatus,
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });

    if (agentStatus === "failed") {
      this.store.updateStatus(workflowRun.id, "failed", "Implement agent failed");
      await safeGitHub(() => this.github.addComment(
        this.repo, issueNumber,
        `**DevAgent implementation failed.**\nThe implement agent exited with code ${result.exitCode}. This issue has been marked as failed.`,
      ), undefined);
      this.cleanupWorktree(issueNumber, workflowRun.id);
      return this.store.getWorkflowRun(workflowRun.id)!;
    }

    // Store implementation artifact
    const output = result.output as Record<string, unknown> | null;
    const summary = (output?.summary as string) ?? "Implementation completed.";
    this.store.createArtifact({
      workflowRunId: workflowRun.id,
      agentRunId: agentRun.id,
      type: "implementation_report",
      phase: "implement",
      summary,
      data: output ?? {},
      filePath: result.outputPath,
    });

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

    // 3. Create agent run for "verify", set currentPhase
    const agentRun = this.store.createAgentRun({
      workflowRunId: workflowRun.id,
      phase: "verify",
    });
    this.store.updateWorkflowRun(workflowRun.id, { currentPhase: "verify" });

    // 4. Launch verify phase with verify commands as input
    const result = await this.launcher.launch({
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
      await safeGitHub(() => this.github.addComment(
        this.repo, issueNumber,
        `**DevAgent verification failed.**\nThe verify agent exited with code ${result.exitCode}.`,
      ), undefined);
      return this.store.getWorkflowRun(workflowRun.id)!;
    }

    // Store verification artifact
    const output = result.output as Record<string, unknown> | null;
    const summary = (output?.summary as string) ?? "Verification passed.";
    this.store.createArtifact({
      workflowRunId: workflowRun.id,
      agentRunId: agentRun.id,
      type: "verification_report",
      phase: "verify",
      summary,
      data: output ?? {},
      filePath: result.outputPath,
    });

    this.store.updateStatus(workflowRun.id, "awaiting_local_verify", "Verification passed");
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
    await safeGitHub(() => this.github.addComment(
      this.repo,
      issueNumber,
      `**DevAgent opened a draft PR:** [#${pr.number}](${pr.url})`,
    ), undefined);

    // 9. Add "da:pr-open" label
    await safeGitHub(() => this.github.addLabels(this.repo, issueNumber, ["da:pr-open"]), undefined);

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
    this.store.updateWorkflowRun(wfRun.id, { currentPhase: "review" });

    const result = await this.launcher.launch({
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
    const verdict = (output?.verdict as string) ?? "pass";
    const blockingCount = (output?.blockingCount as number) ?? 0;
    const summary = (output?.summary as string) ?? "Review complete.";

    // Store review artifact
    this.store.createArtifact({
      workflowRunId: wfRun.id,
      agentRunId: agentRun.id,
      type: "review_report",
      phase: "review",
      summary,
      data: output ?? {},
      filePath: result.outputPath,
    });

    await safeGitHub(() => this.github.addComment(
      this.repo, issueNumber,
      `**Auto Review**\n\n${summary}`,
    ), undefined);

    if (verdict === "block" || blockingCount > 0) {
      this.store.updateStatus(wfRun.id, "auto_review_fix_loop", `Review found ${blockingCount} blocking issues`);
    } else {
      this.store.updateStatus(wfRun.id, "awaiting_human_review", "Auto review passed");
      await safeGitHub(() => this.github.addLabels(this.repo, issueNumber, ["da:awaiting-human"]), undefined);
      await safeGitHub(() => this.github.addComment(
        this.repo, issueNumber,
        "**Auto review passed.** Ready for human review.",
      ), undefined);
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
      await safeGitHub(() => this.github.addComment(
        this.repo, issueNumber,
        `**Escalated.** Repair loop exceeded ${maxRounds} rounds. Human intervention needed.`
      ), undefined);
      await safeGitHub(() => this.github.addLabels(this.repo, issueNumber, ["da:escalated"]), undefined);
      return this.store.getWorkflowRun(wfRun.id)!;
    }

    const workDir = wfRun.worktreePath ?? this.repoRoot;

    const agentRun = this.store.createAgentRun({
      workflowRunId: wfRun.id,
      phase: "repair",
    });
    this.store.updateWorkflowRun(wfRun.id, { currentPhase: "repair" });

    // Load review findings to pass into repair
    const reviewReport = this.store.getLatestArtifact(wfRun.id, "review_report");
    const findings = (reviewReport?.data?.findings as unknown[]) ?? [];

    const result = await this.launcher.launch({
      phase: "repair",
      repoPath: workDir,
      runId: agentRun.id,
      input: {
        round: currentRound,
        issueNumber,
        prNumber: wfRun.prNumber,
        findings,
      },
    });

    this.store.completeAgentRun(agentRun.id, {
      status: result.exitCode === 0 ? "success" : "failed",
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });

    this.store.updateWorkflowRun(wfRun.id, { repairRound: currentRound });

    if (result.exitCode !== 0) {
      this.store.updateStatus(wfRun.id, "failed", `Repair round ${currentRound} failed`);
      return this.store.getWorkflowRun(wfRun.id)!;
    }

    const output = result.output as Record<string, unknown> | null;
    const remainingFindings = (output?.remainingFindings as number) ?? 0;
    const verificationPassed = (output?.verificationPassed as boolean) ?? true;
    const summary = (output?.summary as string) ?? `Repair round ${currentRound} complete.`;

    // Store repair artifact
    this.store.createArtifact({
      workflowRunId: wfRun.id,
      agentRunId: agentRun.id,
      type: "repair_report",
      phase: "repair",
      summary,
      data: output ?? {},
      filePath: result.outputPath,
    });

    await safeGitHub(() => this.github.addComment(
      this.repo, issueNumber,
      `**Repair Round ${currentRound}**\n\n${summary}`,
    ), undefined);

    if (currentRound >= maxRounds && (remainingFindings > 0 || !verificationPassed)) {
      this.store.updateStatus(wfRun.id, "escalated", `Repair failed after ${maxRounds} rounds`);
      await safeGitHub(() => this.github.addComment(
        this.repo, issueNumber,
        `**Escalated.** Repair loop failed after ${maxRounds} rounds. Human intervention needed.`,
      ), undefined);
      await safeGitHub(() => this.github.addLabels(this.repo, issueNumber, ["da:escalated"]), undefined);
      return this.store.getWorkflowRun(wfRun.id)!;
    }

    this.store.updateStatus(wfRun.id, "draft_pr_opened", `Repair round ${currentRound} complete, ready for re-review`);
    return this.store.getWorkflowRun(wfRun.id)!;
  }

  /**
   * Resolve PR review comments by running a repair phase with the comments as findings.
   * Works on an existing workflow run that has a PR open.
   */
  async resolveComments(issueNumber: number): Promise<WorkflowRun> {
    const wfRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!wfRun) throw new Error(`No workflow run for issue #${issueNumber}`);
    if (!wfRun.prNumber) throw new Error(`No PR associated with issue #${issueNumber}`);

    // Fetch review comments from GitHub
    const reviewComments = await this.github.fetchPRReviewComments(this.repo, wfRun.prNumber);
    if (reviewComments.length === 0) {
      console.log("No review comments found on PR.");
      return wfRun;
    }

    // Convert review comments to findings format for the repair phase
    const findings = reviewComments.map((c) => ({
      file: "",
      line: 0,
      severity: "major" as const,
      message: c.body,
      category: "review-comment",
      author: c.author,
    }));

    // Transition to auto_review_fix_loop if needed
    const validSourceStatuses = ["draft_pr_opened", "awaiting_human_review", "auto_review_fix_loop"];
    if (!validSourceStatuses.includes(wfRun.status)) {
      throw new Error(
        `Cannot resolve comments: status is "${wfRun.status}". Expected one of: ${validSourceStatuses.join(", ")}`,
      );
    }
    if (wfRun.status !== "auto_review_fix_loop") {
      this.store.updateStatus(wfRun.id, "auto_review_fix_loop", "Resolving PR review comments");
    }

    const workDir = wfRun.worktreePath ?? this.repoRoot;
    const currentRound = wfRun.repairRound + 1;

    const agentRun = this.store.createAgentRun({
      workflowRunId: wfRun.id,
      phase: "repair",
    });
    this.store.updateWorkflowRun(wfRun.id, { currentPhase: "repair" });

    // Store a synthetic review_report artifact so repair can reference it
    this.store.createArtifact({
      workflowRunId: wfRun.id,
      agentRunId: agentRun.id,
      type: "review_report",
      phase: "review",
      summary: `${reviewComments.length} PR review comment(s) to resolve`,
      data: { findings, verdict: "block", blockingCount: reviewComments.length },
    });

    const result = await this.launcher.launch({
      phase: "repair",
      repoPath: workDir,
      runId: agentRun.id,
      input: {
        round: currentRound,
        issueNumber,
        prNumber: wfRun.prNumber,
        findings,
      },
    });

    this.store.completeAgentRun(agentRun.id, {
      status: result.exitCode === 0 ? "success" : "failed",
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });

    this.store.updateWorkflowRun(wfRun.id, { repairRound: currentRound });

    if (result.exitCode !== 0) {
      this.store.updateStatus(wfRun.id, "failed", `Repair round ${currentRound} failed`);
      return this.store.getWorkflowRun(wfRun.id)!;
    }

    const output = result.output as Record<string, unknown> | null;
    const summary = (output?.summary as string) ?? `Resolved review comments (round ${currentRound}).`;

    this.store.createArtifact({
      workflowRunId: wfRun.id,
      agentRunId: agentRun.id,
      type: "repair_report",
      phase: "repair",
      summary,
      data: output ?? {},
      filePath: result.outputPath,
    });

    // Push fixes
    const branch = wfRun.branch ?? `da/issue-${issueNumber}`;
    try {
      await this.github.pushBranch(workDir, branch);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[orchestrator] Failed to push fixes: ${msg}\n`);
    }

    await safeGitHub(() => this.github.addComment(
      this.repo, issueNumber,
      `**DevAgent resolved review comments (round ${currentRound})**\n\n${summary}`,
    ), undefined);

    this.store.updateStatus(wfRun.id, "draft_pr_opened", `Review comments resolved (round ${currentRound})`);
    return this.store.getWorkflowRun(wfRun.id)!;
  }

  async runWorkflow(
    issueNumber: number,
    options: { autoApprove?: boolean } = {},
  ): Promise<WorkflowRun> {
    // Phase 1: Triage
    let run = await this.triage(issueNumber);
    if (run.status === "failed") return run;

    // Phase 2: Plan
    run = await this.plan(issueNumber);
    if (run.status === "failed") return run;

    // Auto-approve or wait
    if (options.autoApprove) {
      run = await this.approvePlan(issueNumber);
    } else {
      return run;
    }

    // Phase 3: Implement
    run = await this.implement(issueNumber);
    if (run.status === "failed") return run;

    // Phase 4: Verify
    run = await this.verify(issueNumber);
    if (run.status === "failed") return run;

    // Phase 5: Open PR
    if (run.status === "awaiting_local_verify") {
      run = await this.openPR(issueNumber);
      if (run.status === "failed") return run;
    }

    // Phase 6: Review + Repair loop
    const maxRounds = this.config.repair.max_rounds;
    for (let round = 0; round <= maxRounds; round++) {
      run = await this.review(issueNumber);

      if (run.status === "awaiting_human_review") {
        return run;
      }

      if (run.status === "auto_review_fix_loop") {
        run = await this.repair(issueNumber);
        if (run.status === "failed" || run.status === "escalated") {
          return run;
        }
        // repair transitions back to draft_pr_opened → loop continues
      }
    }

    // If we exhausted the loop without resolution, return current state
    const finalRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    return finalRun!;
  }
}
