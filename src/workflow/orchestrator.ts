import type { StateStore } from "../state/store.js";
import type { GitHubGateway } from "../github/gateway.js";
import type { WorkflowConfig } from "./config.js";
import type { WorkflowRun } from "../state/types.js";
import type { LaunchResult } from "../runner/launcher.js";
import type { WorktreeManager } from "../workspace/worktree-manager.js";
import type { ReviewGate, GateVerdict } from "./review-gate.js";
import type {
  TriageOutput,
  PlanOutput,
  ImplementOutput,
  VerifyOutput,
  ReviewOutput,
  RepairOutput,
} from "./stage-schemas.js";
import { defaultConfig } from "./config.js";
import { resolveSkills } from "./skill-resolver.js";
import { execFileSync } from "node:child_process";

export interface Finding {
  file: string;
  line: number;
  severity: string;
  message: string;
  category: string;
  author?: string;
}

/** Enrich a stage input with resolved skills from config. */
function withSkills(
  input: Record<string, unknown>,
  config: WorkflowConfig,
  phase: string,
  changedFiles?: string[],
): Record<string, unknown> {
  const skills = resolveSkills(config, phase, changedFiles);
  if (skills.length === 0) return input;
  return { ...input, skills };
}

/** Safely cast launcher output to a typed phase output, returning null on mismatch. */
function asOutput<T>(output: unknown): T | null {
  if (output && typeof output === "object") return output as T;
  return null;
}

/** Convert a typed output back to Record for artifact storage. */
function toData(output: unknown): Record<string, unknown> {
  return (output as Record<string, unknown>) ?? {};
}

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
  reviewGate?: ReviewGate;
}

export class WorkflowOrchestrator {
  private store: StateStore;
  private github: GitHubGateway;
  private launcher: OrchestratorDeps["launcher"];
  private repo: string;
  private repoRoot: string;
  private config: WorkflowConfig;
  private worktreeManager?: WorktreeManager;
  private reviewGate?: ReviewGate;

  constructor(deps: OrchestratorDeps) {
    this.store = deps.store;
    this.github = deps.github;
    this.launcher = deps.launcher;
    this.repo = deps.repo;
    this.repoRoot = deps.repoRoot ?? ".";
    this.config = deps.config ?? defaultConfig();
    this.worktreeManager = deps.worktreeManager;
    this.reviewGate = deps.reviewGate;
  }

  private get isWatchMode(): boolean {
    return (this.config.mode === "watch" || this.config.mode === "autopilot") && this.reviewGate !== undefined;
  }

  /** Request the workflow to pause after the current phase completes. */
  requestPause(runId: string): void {
    const run = this.store.getWorkflowRun(runId);
    if (!run) return;
    this.store.updateWorkflowRun(runId, {
      metadata: { ...run.metadata, pauseRequested: true },
    });
    process.stderr.write(`[orchestrator] Pause requested for run ${runId.slice(0, 8)}\n`);
  }

  /** Check if a pause was requested and clear the flag. Returns true if paused. */
  private checkPause(runId: string): boolean {
    const run = this.store.getWorkflowRun(runId);
    if (!run?.metadata?.pauseRequested) return false;
    const { pauseRequested: _, ...rest } = run.metadata;
    this.store.updateWorkflowRun(runId, { metadata: rest });
    process.stderr.write(`[orchestrator] Run ${runId.slice(0, 8)} paused between phases\n`);
    return true;
  }

  /**
   * Run a review gate on a stage's output. Stores gate_verdict artifact.
   * Returns the verdict.
   */
  private async runGate(
    phase: string,
    output: Record<string, unknown>,
    workflowRunId: string,
    issueNumber: number,
    repoPath?: string,
  ): Promise<GateVerdict> {
    const verdict = await this.reviewGate!.evaluate(phase, output, {
      workflowRunId,
      repoPath: repoPath ?? this.repoRoot,
      issueNumber,
    });

    this.store.createArtifact({
      workflowRunId,
      type: "gate_verdict",
      phase,
      summary: verdict.reason,
      data: { action: verdict.action, reason: verdict.reason, findings: verdict.findings },
    });

    return verdict;
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
      input: withSkills({
        issueNumber: issue.number,
        title: issue.title,
        body: issue.body,
        labels: [...issue.labels],
        author: issue.author,
      }, this.config, "triage"),
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
    const output = asOutput<TriageOutput>(result.output);
    const summary = output?.summary ?? "Triage completed successfully.";
    this.store.createArtifact({
      workflowRunId: workflowRun.id,
      agentRunId: agentRun.id,
      type: "triage_report",
      phase: "triage",
      summary,
      data: toData(output),
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
    const output = asOutput<PlanOutput>(result.output);
    const summary = output?.summary ?? "Plan created successfully.";
    this.store.createArtifact({
      workflowRunId: workflowRun.id,
      agentRunId: agentRun.id,
      type: "plan_draft",
      phase: "plan",
      summary,
      data: toData(output),
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

    const planData = acceptedPlan?.data ?? {};
    const planFiles = [
      ...((planData.filesToCreate as string[]) ?? []),
      ...((planData.filesToModify as string[]) ?? []),
    ];
    const result = await this.launcher.launch({
      phase: "implement",
      repoPath: workDir,
      runId: agentRun.id,
      input: withSkills({
        issueNumber: issue.number,
        title: issue.title,
        body: issue.body,
        acceptedPlan: planData,
      }, this.config, "implement", planFiles),
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
    const output = asOutput<ImplementOutput>(result.output);
    const summary = output?.summary ?? "Implementation completed.";
    this.store.createArtifact({
      workflowRunId: workflowRun.id,
      agentRunId: agentRun.id,
      type: "implementation_report",
      phase: "implement",
      summary,
      data: toData(output),
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
    const output = asOutput<VerifyOutput>(result.output);
    const summary = output?.summary ?? "Verification passed.";
    this.store.createArtifact({
      workflowRunId: workflowRun.id,
      agentRunId: agentRun.id,
      type: "verification_report",
      phase: "verify",
      summary,
      data: toData(output),
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

    // 3. Push branch (commit uncommitted changes first)
    const implArtifact = this.store.getLatestArtifact(workflowRun.id, "implementation_report");
    const implData = implArtifact?.data as ImplementOutput | undefined;
    const commitMsg = implData?.suggestedCommitMessage ?? `feat: devagent changes for #${issueNumber}`;
    await this.github.pushBranch(workDir, branch, commitMsg);

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

    const output = asOutput<ReviewOutput>(result.output);
    const verdict = output?.verdict ?? "pass";
    const blockingCount = output?.blockingCount ?? 0;
    const summary = output?.summary ?? "Review complete.";

    // Store review artifact
    this.store.createArtifact({
      workflowRunId: wfRun.id,
      agentRunId: agentRun.id,
      type: "review_report",
      phase: "review",
      summary,
      data: toData(output),
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

    const output = asOutput<RepairOutput>(result.output);
    const remainingFindings = output?.remainingFindings ?? 0;
    const verificationPassed = output?.verificationPassed ?? true;
    const summary = output?.summary ?? `Repair round ${currentRound} complete.`;

    // Store repair artifact
    this.store.createArtifact({
      workflowRunId: wfRun.id,
      agentRunId: agentRun.id,
      type: "repair_report",
      phase: "repair",
      summary,
      data: toData(output),
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
   * Shared helper: validate status, check conflicts, run repair agent, push fixes.
   * Returns the updated workflow run.
   */
  private async repairFromFindings(
    wfRun: WorkflowRun,
    issueNumber: number,
    findings: Finding[],
    label: string,
  ): Promise<{ run: WorkflowRun; summary: string }> {
    const validStatuses = ["draft_pr_opened", "awaiting_human_review", "auto_review_fix_loop"];
    if (!validStatuses.includes(wfRun.status)) {
      throw new Error(
        `Cannot ${label}: status is "${wfRun.status}". Expected one of: ${validStatuses.join(", ")}`,
      );
    }
    if (wfRun.status !== "auto_review_fix_loop") {
      this.store.updateStatus(wfRun.id, "auto_review_fix_loop", label);
    }

    const workDir = wfRun.worktreePath ?? this.repoRoot;
    const branch = wfRun.branch ?? `da/issue-${issueNumber}`;

    // Check for branch conflicts — add to findings for the repair agent
    const conflictCheck = await safeGitHub(
      () => this.github.checkBranchConflicts(workDir, branch, "main"),
      { conflicted: false, conflictFiles: [] },
    );
    if (conflictCheck.conflicted) {
      if (conflictCheck.conflictFiles.length > 0) {
        for (const f of conflictCheck.conflictFiles) {
          findings.push({
            file: f, line: 0, severity: "critical",
            message: "Merge conflict with main — run 'git fetch origin main && git rebase origin/main' and resolve conflicts in this file",
            category: "merge-conflict",
          });
        }
      } else {
        findings.push({
          file: "", line: 0, severity: "critical",
          message: "Branch conflicts with main. Run 'git fetch origin main && git rebase origin/main' and resolve all merge conflicts.",
          category: "merge-conflict",
        });
      }
    }

    const currentRound = wfRun.repairRound + 1;
    const agentRun = this.store.createAgentRun({ workflowRunId: wfRun.id, phase: "repair" });
    this.store.updateWorkflowRun(wfRun.id, { currentPhase: "repair" });

    this.store.createArtifact({
      workflowRunId: wfRun.id,
      agentRunId: agentRun.id,
      type: "review_report",
      phase: "review",
      summary: `${label}${conflictCheck.conflicted ? " + branch conflicts" : ""}`,
      data: { findings, verdict: "block", blockingCount: findings.length },
    });

    const result = await this.launcher.launch({
      phase: "repair",
      repoPath: workDir,
      runId: agentRun.id,
      input: { round: currentRound, issueNumber, prNumber: wfRun.prNumber, findings },
    });

    this.store.completeAgentRun(agentRun.id, {
      status: result.exitCode === 0 ? "success" : "failed",
      outputPath: result.outputPath,
      eventsPath: result.eventsPath,
    });
    this.store.updateWorkflowRun(wfRun.id, { repairRound: currentRound });

    if (result.exitCode !== 0) {
      this.store.updateStatus(wfRun.id, "failed", `Repair round ${currentRound} failed`);
      return { run: this.store.getWorkflowRun(wfRun.id)!, summary: "" };
    }

    const output = asOutput<RepairOutput>(result.output);
    const summary = output?.summary ?? `${label} (round ${currentRound}) complete.`;

    this.store.createArtifact({
      workflowRunId: wfRun.id,
      agentRunId: agentRun.id,
      type: "repair_report",
      phase: "repair",
      summary,
      data: toData(output),
      filePath: result.outputPath,
    });

    try {
      await this.github.pushBranch(workDir, branch);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[orchestrator] Failed to push fixes: ${msg}\n`);
    }

    return { run: this.store.getWorkflowRun(wfRun.id)!, summary };
  }

  /**
   * Resolve PR review comments by running a repair phase with the comments as findings.
   */
  async resolveComments(issueNumber: number): Promise<WorkflowRun> {
    const wfRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!wfRun) throw new Error(`No workflow run for issue #${issueNumber}`);
    if (!wfRun.prNumber) throw new Error(`No PR associated with issue #${issueNumber}`);

    const reviewComments = await this.github.fetchPRReviewComments(this.repo, wfRun.prNumber);
    if (reviewComments.length === 0) {
      process.stderr.write("[orchestrator] No review comments found on PR.\n");
      return wfRun;
    }

    const findings: Finding[] = reviewComments.map((c) => ({
      file: "", line: 0, severity: "major",
      message: c.body, category: "review-comment", author: c.author,
    }));

    const { run, summary } = await this.repairFromFindings(
      wfRun, issueNumber, findings,
      `${reviewComments.length} PR review comment(s) to resolve`,
    );

    if (run.status === "failed") return run;

    // Resolve review threads on GitHub
    const commentNodeIds = reviewComments
      .map((c) => c.nodeId)
      .filter((id): id is string => id !== undefined);
    if (commentNodeIds.length > 0) {
      await safeGitHub(
        () => this.github.resolveReviewThreads(this.repo, wfRun.prNumber!, commentNodeIds),
        undefined,
      );
    }

    await safeGitHub(() => this.github.addComment(
      this.repo, issueNumber,
      `**DevAgent resolved review comments**\n\n${summary}`,
    ), undefined);

    this.store.updateStatus(wfRun.id, "draft_pr_opened", "Review comments resolved");
    return this.store.getWorkflowRun(wfRun.id)!;
  }

  /**
   * Fix CI failures on a PR by fetching failed check logs, running repair, and pushing.
   * Optionally marks the PR as ready (undraft) when CI passes.
   */
  async fixCI(issueNumber: number, options: { markReady?: boolean } = {}): Promise<WorkflowRun> {
    const wfRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!wfRun) throw new Error(`No workflow run for issue #${issueNumber}`);
    if (!wfRun.prNumber) throw new Error(`No PR associated with issue #${issueNumber}`);

    const failureLogs = await this.github.fetchCIFailureLogs(this.repo, wfRun.prNumber);
    if (failureLogs.length === 0) {
      process.stderr.write("[orchestrator] No CI failures found on PR.\n");
      if (options.markReady) {
        await safeGitHub(() => this.github.markPRReady(this.repo, wfRun.prNumber!), undefined);
        await safeGitHub(() => this.github.addComment(
          this.repo, issueNumber,
          "**CI passed.** PR marked as ready for review.",
        ), undefined);
        this.store.updateStatus(wfRun.id, "awaiting_human_review", "CI passed, PR ready");
      }
      return this.store.getWorkflowRun(wfRun.id) ?? wfRun;
    }

    const findings: Finding[] = failureLogs.map((f) => ({
      file: "", line: 0, severity: "critical",
      message: `CI check "${f.check}" failed.\n\nFailed log output:\n${f.log}`,
      category: "ci-failure",
    }));

    const { run, summary } = await this.repairFromFindings(
      wfRun, issueNumber, findings,
      `${failureLogs.length} CI failure(s) to fix`,
    );

    if (run.status === "failed") return run;

    await safeGitHub(() => this.github.addComment(
      this.repo, issueNumber,
      `**DevAgent CI fix**\n\n${summary}`,
    ), undefined);

    this.store.updateStatus(wfRun.id, "draft_pr_opened", "CI fix complete");
    return this.store.getWorkflowRun(wfRun.id)!;
  }

  /**
   * Poll CI checks until they complete, then fix failures if any.
   * Returns the updated run. Used in watch mode after PR open and after repairs.
   */
  private async waitForCIAndFix(issueNumber: number, run: WorkflowRun): Promise<WorkflowRun> {
    if (!run.prNumber) return run;
    const prNumber = run.prNumber;
    const maxCIRounds = this.config.repair.max_rounds;

    for (let round = 0; round <= maxCIRounds; round++) {
      // Poll until checks complete
      const checks = await this.pollCIChecks(prNumber);
      const failed = checks.filter((c) => c.conclusion === "failure");

      if (failed.length === 0) {
        process.stderr.write(`[orchestrator] CI passed for PR #${run.prNumber}\n`);
        return this.store.getWorkflowRun(run.id)!;
      }

      process.stderr.write(
        `[orchestrator] CI failed (${failed.map((c) => c.name).join(", ")}), repair round ${round + 1}/${maxCIRounds + 1}\n`,
      );

      if (round === maxCIRounds) {
        this.store.updateStatus(run.id, "escalated", `CI still failing after ${maxCIRounds + 1} fix attempts`);
        await safeGitHub(() => this.github.addComment(
          this.repo, issueNumber,
          `**CI still failing after ${maxCIRounds + 1} fix attempts.** Escalating for human review.`,
        ), undefined);
        return this.store.getWorkflowRun(run.id)!;
      }

      // Fix CI failures
      run = await this.fixCI(issueNumber);
      if (run.status === "failed" || run.status === "escalated") return run;
    }

    return this.store.getWorkflowRun(run.id)!;
  }

  /**
   * Poll PR checks until all are completed (no more in_progress).
   * Returns the final check states.
   */
  private async pollCIChecks(prNumber: number): Promise<{ name: string; status: string; conclusion: string | null }[]> {
    const maxWait = 10 * 60_000; // 10 minutes
    const interval = 30_000; // 30 seconds
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const checks = await this.github.fetchPRChecks(this.repo, prNumber);
      const pending = checks.filter((c) => c.status !== "completed");
      if (pending.length === 0) return checks;

      process.stderr.write(
        `[orchestrator] Waiting for ${pending.length} CI check(s)...\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    // Timeout — return whatever we have
    return this.github.fetchPRChecks(this.repo, prNumber);
  }

  async runWorkflow(
    issueNumber: number,
    options: { autoApprove?: boolean } = {},
  ): Promise<WorkflowRun> {
    if (this.isWatchMode) {
      return this.runWorkflowWatch(issueNumber);
    }
    return this.runWorkflowAssisted(issueNumber, options);
  }

  private async runWorkflowAssisted(
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

  /**
   * Watch mode workflow: inter-stage gates replace human approval.
   * Gates evaluate each stage's output; on "proceed" the workflow continues,
   * on "rework" the stage is retried (up to max_rounds), on "escalate" the run stops.
   */
  private async runWorkflowWatch(issueNumber: number): Promise<WorkflowRun> {
    const maxGateReworks = this.config.repair.max_rounds;

    // Phase 1: Triage + gate
    let run = await this.triage(issueNumber);
    if (run.status === "failed") return run;

    const triageOutput = this.store.getLatestArtifact(run.id, "triage_report");
    const triageVerdict = await this.runGate("triage", triageOutput?.data ?? {}, run.id, issueNumber);
    if (triageVerdict.action === "escalate") {
      this.store.updateStatus(run.id, "escalated", triageVerdict.reason);
      await safeGitHub(() => this.github.addComment(
        this.repo, issueNumber,
        `**Gate: triage rejected.** ${triageVerdict.reason}`,
      ), undefined);
      return this.store.getWorkflowRun(run.id)!;
    }

    if (this.checkPause(run.id)) return this.store.getWorkflowRun(run.id)!;

    // Phase 2: Plan + gate (with rework loop)
    for (let attempt = 0; attempt <= maxGateReworks; attempt++) {
      run = await this.plan(issueNumber);
      if (run.status === "failed") return run;

      const planOutput = this.store.getLatestArtifact(run.id, "plan_draft");
      const planVerdict = await this.runGate("plan", planOutput?.data ?? {}, run.id, issueNumber);

      if (planVerdict.action === "proceed") {
        // Auto-approve the plan
        run = await this.approvePlan(issueNumber);
        break;
      }

      if (planVerdict.action === "escalate" || attempt === maxGateReworks) {
        this.store.updateStatus(run.id, "escalated",
          planVerdict.action === "escalate"
            ? planVerdict.reason
            : `Plan gate rejected after ${attempt + 1} attempts`,
        );
        await safeGitHub(() => this.github.addComment(
          this.repo, issueNumber,
          `**Gate: plan rejected.** ${planVerdict.reason}`,
        ), undefined);
        return this.store.getWorkflowRun(run.id)!;
      }

      // Rework: transition to plan_revision and loop
      await this.reworkPlanInternal(issueNumber, planVerdict.reason);
    }

    if (run.status !== "plan_accepted") return run;
    if (this.checkPause(run.id)) return this.store.getWorkflowRun(run.id)!;

    // Phase 3: Implement + gate
    run = await this.implement(issueNumber);
    if (run.status === "failed") return run;

    // Re-fetch run to get worktreePath set during implement
    run = this.store.getWorkflowRun(run.id)!;
    const implWorkDir = run.worktreePath ?? this.repoRoot;

    // Stage and commit changes so the gate sees clean working tree
    const implStatus = execFileSync("git", ["status", "--porcelain"], {
      cwd: implWorkDir, encoding: "utf-8",
    }).trim();
    if (implStatus.length > 0) {
      execFileSync("git", ["add", "-A"], { cwd: implWorkDir, encoding: "utf-8" });
      execFileSync("git", ["commit", "-m", `feat(#${issueNumber}): implement changes`], {
        cwd: implWorkDir, encoding: "utf-8",
      });
    }

    const implOutput = this.store.getLatestArtifact(run.id, "implementation_report");
    const implVerdict = await this.runGate("implement", implOutput?.data ?? {}, run.id, issueNumber, implWorkDir);
    if (implVerdict.action !== "proceed") {
      this.store.updateStatus(run.id, "escalated", implVerdict.reason);
      await safeGitHub(() => this.github.addComment(
        this.repo, issueNumber,
        `**Gate: implementation rejected.** ${implVerdict.reason}`,
      ), undefined);
      return this.store.getWorkflowRun(run.id)!;
    }

    if (this.checkPause(run.id)) return this.store.getWorkflowRun(run.id)!;

    // Phase 4: Verify
    run = await this.verify(issueNumber);
    if (run.status === "failed") return run;

    // Phase 5: Open PR
    if (run.status === "awaiting_local_verify") {
      run = await this.openPR(issueNumber);
      if (run.status === "failed") return run;
    }

    if (this.checkPause(run.id)) return this.store.getWorkflowRun(run.id)!;

    // Phase 6: Wait for CI, fix failures if any
    run = await this.waitForCIAndFix(issueNumber, run);
    if (run.status === "failed" || run.status === "escalated") return run;

    // Phase 7: Review + Repair loop
    const maxRounds = this.config.repair.max_rounds;
    for (let round = 0; round <= maxRounds; round++) {
      run = await this.review(issueNumber);

      if (run.status === "awaiting_human_review") {
        // Watch mode: auto-ready the PR and mark done
        await safeGitHub(() => this.github.markPRReady(this.repo, run.prNumber!), undefined);
        this.store.updateStatus(run.id, "ready_to_merge", "Auto review passed, PR marked ready");
        this.store.updateStatus(run.id, "done", "Workflow complete");
        await safeGitHub(() => this.github.addComment(
          this.repo, issueNumber,
          "**DevAgent workflow complete.** PR is ready for merge.",
        ), undefined);
        return this.store.getWorkflowRun(run.id)!;
      }

      if (run.status === "auto_review_fix_loop") {
        run = await this.repair(issueNumber);
        if (run.status === "failed" || run.status === "escalated") {
          return run;
        }
        // After repair, wait for CI again before next review
        run = await this.waitForCIAndFix(issueNumber, run);
        if (run.status === "failed" || run.status === "escalated") return run;
      }
    }

    const finalRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    return finalRun!;
  }

  /**
   * Internal rework for watch mode — transitions plan without GitHub comment about human rework.
   */
  private async reworkPlanInternal(issueNumber: number, reason: string): Promise<void> {
    const workflowRun = this.store.getWorkflowRunByIssue(this.repo, issueNumber);
    if (!workflowRun) return;

    const pending = this.store.getPendingApproval(workflowRun.id);
    if (pending) {
      this.store.resolveApprovalRequest(pending.id, "rework", reason);
    }

    this.store.updateStatus(workflowRun.id, "plan_revision", reason);
  }
}
