import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { GitHubGateway } from "../github/gateway.js";
import type { GitHubIssue } from "../github/types.js";
import {
  branchExists,
  loadBaselineManifest,
  readBranchHead,
  readCurrentBaselineSystemSnapshot,
} from "../baseline/manifest.js";
import type { WorkflowConfig } from "../workflow/config.js";
import { resolveSkills } from "../workflow/skill-resolver.js";
import { CanonicalStore } from "../persistence/canonical-store.js";
import type { Project, WorkItem, WorkflowBaselineSnapshot, WorkflowInstance } from "../canonical/types.js";
import type {
  ArtifactKind,
  ExecutorSpec,
  TaskExecutionRequest,
  TaskExecutionResult,
  WorkflowTaskType,
} from "@devagent-sdk/types";
import { PROTOCOL_VERSION } from "@devagent-sdk/types";
import type { RunnerClient } from "../runner-client/types.js";
import { WorkflowStateError } from "./errors.js";

type StageContextOverrides = {
  summary?: string;
  issueBody?: string;
  comments?: Array<{ author?: string; body: string }>;
  extraInstructions?: string[];
  changedFilesHint?: string[];
};

function issueId(projectId: string, issue: GitHubIssue): string {
  return `${projectId}:issue:${issue.number}`;
}

function mapExecutorId(bin?: string): ExecutorSpec["executorId"] {
  if (bin?.includes("codex")) return "codex";
  if (bin?.includes("claude")) return "claude";
  if (bin?.includes("opencode")) return "opencode";
  return "devagent";
}

function artifactKindForStage(stage: WorkflowTaskType): ArtifactKind {
  switch (stage) {
    case "triage":
      return "triage-report";
    case "plan":
      return "plan";
    case "implement":
      return "implementation-summary";
    case "verify":
      return "verification-report";
    case "review":
      return "review-report";
    case "repair":
      return "final-summary";
  }
}

function isFailureStatus(status: WorkflowInstance["status"]): boolean {
  return status === "failed" || status === "cancelled";
}

export class WorkflowService {
  constructor(
    private readonly store: CanonicalStore,
    private readonly github: GitHubGateway,
    private readonly runnerClient: RunnerClient,
    private readonly project: Project,
    private readonly config: WorkflowConfig,
  ) {}

  async syncIssues(): Promise<WorkItem[]> {
    const issues = await this.github.fetchEligibleIssues(
      this.project.repoFullName,
      this.config.tracker.issue_labels_include,
    );
    return issues.map((issue) => this.upsertIssue(issue));
  }

  async ensureIssue(externalId: string): Promise<WorkItem> {
    const existing = this.store.getWorkItemByExternalId(this.project.id, externalId);
    if (existing) return existing;
    const issue = await this.github.fetchIssue(this.project.repoFullName, Number(externalId));
    return this.upsertIssue(issue);
  }

  async start(issueExternalId: string): Promise<WorkflowInstance> {
    const workItem = await this.ensureIssue(issueExternalId);
    const branch = `devagent/workflow/${workItem.externalId}-${randomUUID().slice(0, 8)}`;
    const baselineSnapshot = this.captureBaselineSnapshot("main");
    let workflow = this.store.createWorkflowInstance({
      projectId: this.project.id,
      workItemId: workItem.id,
      stage: "triage",
      status: "running",
      branch,
      baseBranch: baselineSnapshot.targetBranch,
      baseSha: baselineSnapshot.targetBaseSha,
      baselineSnapshot,
    });

    workflow = await this.runStage(workflow, workItem, "triage");
    if (isFailureStatus(workflow.status)) {
      return workflow;
    }

    workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "plan", status: "running" });
    workflow = await this.runStage(workflow, workItem, "plan");
    if (isFailureStatus(workflow.status)) {
      return workflow;
    }

    this.store.createApproval({ workflowInstanceId: workflow.id, stage: "plan" });
    return this.store.updateWorkflowInstance(workflow.id, { stage: "plan", status: "waiting_approval" });
  }

  async resume(workflowId: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    this.assertWorkflowContinuationSafe(workflow);
    const pending = this.store.getPendingApproval(workflowId);
    const workItem = this.getWorkItem(workflow.workItemId);

    if (!pending || pending.stage !== "plan") {
      throw new Error("Workflow is not waiting on plan approval");
    }

    this.store.updateApproval(pending.id, "approved", "Approved via run resume");

    workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "implement", status: "running" });
    workflow = await this.runStage(workflow, workItem, "implement");
    if (isFailureStatus(workflow.status)) {
      return workflow;
    }

    workflow = await this.runVerifyReviewRepairLoop(workflow, workItem);
    if (isFailureStatus(workflow.status)) {
      return workflow;
    }

    this.store.createApproval({ workflowInstanceId: workflow.id, stage: "review" });
    return this.store.updateWorkflowInstance(workflow.id, { stage: "review", status: "waiting_approval" });
  }

  async reject(workflowId: string, note: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    this.assertWorkflowContinuationSafe(workflow);
    const pending = this.store.getPendingApproval(workflowId);
    const workItem = this.getWorkItem(workflow.workItemId);

    if (!pending) {
      throw new Error("Workflow is not waiting on an approval");
    }

    this.store.updateApproval(pending.id, "rejected", note);

    if (pending.stage === "plan") {
      workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "plan", status: "running" });
      workflow = await this.runStage(workflow, workItem, "plan", {
        summary: `Revise rejected plan for issue #${workItem.externalId}`,
        extraInstructions: [
          `Human requested plan changes: ${note}`,
          ...(await this.latestArtifactInstructions(workflow.id, "plan", "Previous rejected plan")),
        ],
      });
      if (isFailureStatus(workflow.status)) {
        return workflow;
      }
      this.store.createApproval({ workflowInstanceId: workflow.id, stage: "plan" });
      return this.store.updateWorkflowInstance(workflow.id, { stage: "plan", status: "waiting_approval" });
    }

    if (pending.stage === "review") {
      workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "repair", status: "running" });
      workflow = await this.runStage(workflow, workItem, "repair", {
        summary: `Address rejected review approval for issue #${workItem.externalId}`,
        extraInstructions: [
          `Human rejected the pre-PR review approval and requested changes: ${note}`,
          ...(await this.latestArtifactInstructions(workflow.id, "review-report", "Latest review report")),
        ],
      });
      if (isFailureStatus(workflow.status)) {
        return workflow;
      }

      workflow = await this.runVerifyReviewRepairLoop(workflow, workItem);
      if (isFailureStatus(workflow.status)) {
        return workflow;
      }

      this.store.createApproval({ workflowInstanceId: workflow.id, stage: "review" });
      return this.store.updateWorkflowInstance(workflow.id, { stage: "review", status: "waiting_approval" });
    }

    throw new Error(`Reject is not supported for approval stage ${pending.stage}`);
  }

  async openPr(workflowId: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    this.assertWorkflowContinuationSafe(workflow);
    const pending = this.store.getPendingApproval(workflowId);
    if (!pending || pending.stage !== "review") {
      throw new Error("Workflow is not waiting on final approval");
    }

    this.store.updateApproval(pending.id, "approved", "Approved via pr open");

    const workItem = this.getWorkItem(workflow.workItemId);
    const attempts = this.store.getWorkflowSnapshot(workflow.id).attempts;
    const latestAttempt = attempts.at(-1);
    if (!latestAttempt?.workspacePath) throw new Error("No workspace available for PR handoff");
    const branch = this.store.getWorkflowBranch(workflow.id);

    await this.github.pushBranch(latestAttempt.workspacePath, branch);
    const pr = await this.github.createPR(this.project.repoFullName, {
      title: workItem.title,
      body: `Closes #${workItem.externalId}`,
      head: branch,
      base: workflow.baseBranch,
      draft: this.config.pr.draft,
    });

    workflow = this.store.updateWorkflowInstance(workflow.id, {
      stage: "done",
      status: "completed",
      prNumber: pr.number,
      prUrl: pr.url,
    });
    await this.runnerClient.cleanupRun(latestAttempt.runnerId);
    return workflow;
  }

  async repairPr(workflowId: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    this.assertWorkflowContinuationSafe(workflow);
    if (!workflow.prNumber) {
      throw new Error("Workflow does not have an opened PR");
    }

    const workItem = this.getWorkItem(workflow.workItemId);
    const prNumber = workflow.prNumber;
    const pr = await this.github.fetchPR(this.project.repoFullName, prNumber);
    if (pr.head !== workflow.branch) {
      throw new WorkflowStateError(
        "HISTORICAL_RUN_REQUIRES_MANUAL_INTERVENTION",
        `Workflow ${workflow.id} is pinned to branch ${workflow.branch}, but PR #${prNumber} now points to ${pr.head}`,
      );
    }
    const ciFailureLogs = await this.github.fetchCIFailureLogs(this.project.repoFullName, prNumber);
    const changedFilesHint = [...new Set(pr.reviewComments.flatMap((comment) => (comment.path ? [comment.path] : [])))];

    if (pr.reviewComments.length === 0 && ciFailureLogs.length === 0) {
      throw new Error(`PR #${workflow.prNumber} has no review comments or failing CI checks to repair`);
    }

    workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "repair", status: "running" });
    workflow = await this.runStage(workflow, workItem, "repair", {
      summary: `Repair PR #${pr.number} feedback for issue #${workItem.externalId}`,
      issueBody: [
        `PR: ${pr.url}`,
        `Address all GitHub review comments and failing CI checks for branch ${pr.head}.`,
      ].join("\n"),
      comments: pr.reviewComments.map((comment) => ({
        author: comment.author,
        body: this.formatReviewComment(comment),
      })),
      changedFilesHint,
      extraInstructions: [
        `Resolve the feedback on PR #${pr.number}.`,
        ...pr.reviewComments.map((comment) => this.reviewCommentInstruction(comment)),
        ...ciFailureLogs.map((failure) => `CI failure in ${failure.check}:\n${failure.log}`),
      ],
    });
    if (isFailureStatus(workflow.status)) {
      return workflow;
    }

    workflow = await this.runVerifyReviewRepairLoop(workflow, workItem);
    if (isFailureStatus(workflow.status)) {
      return workflow;
    }

    const latestAttempt = [...this.store.getWorkflowSnapshot(workflow.id).attempts]
      .reverse()
      .find((attempt) => attempt.status === "success" && attempt.workspacePath);
    if (!latestAttempt?.workspacePath) {
      throw new Error("No workspace available for PR repair handoff");
    }

    const branch = this.store.getWorkflowBranch(workflow.id);
    await this.github.pushBranch(latestAttempt.workspacePath, branch, "fix: address PR feedback");
    await this.github.resolveReviewThreads(
      this.project.repoFullName,
      prNumber,
      pr.reviewComments.flatMap((comment) => (comment.nodeId ? [comment.nodeId] : [])),
    );
    await this.runnerClient.cleanupRun(latestAttempt.runnerId);
    return this.store.updateWorkflowInstance(workflow.id, { stage: "done", status: "completed" });
  }

  listWorkflows(): WorkflowInstance[] {
    return this.store.listWorkflowInstances();
  }

  getSnapshot(workflowId: string) {
    return this.store.getWorkflowSnapshot(workflowId);
  }

  async cancel(workflowId: string): Promise<WorkflowInstance> {
    const workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    const snapshot = this.store.getWorkflowSnapshot(workflow.id);
    const runningAttempt = [...snapshot.attempts].reverse().find((attempt) => attempt.status === "running");
    if (runningAttempt) {
      await this.runnerClient.cancel(runningAttempt.runnerId);
    }
    return this.store.updateWorkflowInstance(workflow.id, { status: "cancelled" });
  }

  private upsertIssue(issue: GitHubIssue): WorkItem {
    return this.store.upsertWorkItem({
      id: issueId(this.project.id, issue),
      projectId: this.project.id,
      kind: "github-issue",
      externalId: String(issue.number),
      title: issue.title,
      state: issue.state,
      labels: [...issue.labels],
      url: issue.url,
    });
  }

  private getWorkItem(id: string): WorkItem {
    const workItem = this.store.getWorkItem(id);
    if (!workItem) throw new Error(`Work item ${id} not found`);
    return workItem;
  }

  private captureBaselineSnapshot(baseBranch: string): WorkflowBaselineSnapshot {
    const manifest = loadBaselineManifest();
    const current = readCurrentBaselineSystemSnapshot(manifest);
    const expected = manifest.repos;

    if (
      current.protocolVersion !== manifest.protocolVersion ||
      current.sdkSha !== expected["devagent-sdk"].sha ||
      current.runnerSha !== expected["devagent-runner"].sha ||
      current.devagentSha !== expected["devagent"].sha ||
      current.hubSha !== expected["devagent-hub"].sha
    ) {
      throw new WorkflowStateError(
        "STALE_BASELINE",
        "Current workspace no longer matches the pinned baseline manifest. Refresh all four repos to the recorded baseline before starting a new validation workflow.",
      );
    }

    return {
      targetBranch: baseBranch,
      targetBaseSha: readBranchHead(this.project.repoRoot, baseBranch),
      system: current,
    };
  }

  private assertWorkflowContinuationSafe(workflow: WorkflowInstance): void {
    const manifest = loadBaselineManifest();
    const current = readCurrentBaselineSystemSnapshot(manifest);
    const expected = workflow.baselineSnapshot.system;
    if (
      current.protocolVersion !== expected.protocolVersion ||
      current.sdkSha !== expected.sdkSha ||
      current.runnerSha !== expected.runnerSha ||
      current.devagentSha !== expected.devagentSha ||
      current.hubSha !== expected.hubSha
    ) {
      throw new WorkflowStateError(
        "STALE_BASELINE",
        `Workflow ${workflow.id} was started on baseline ${JSON.stringify(expected)}, but the current workspace has drifted to ${JSON.stringify(current)}.`,
      );
    }

    const currentBaseSha = readBranchHead(this.project.repoRoot, workflow.baseBranch);
    if (currentBaseSha !== workflow.baseSha) {
      throw new WorkflowStateError(
        "STALE_BRANCH_REF",
        `Workflow ${workflow.id} expects ${workflow.baseBranch}@${workflow.baseSha}, but the current branch head is ${currentBaseSha}.`,
      );
    }

    if (!branchExists(this.project.repoRoot, workflow.branch)) {
      throw new WorkflowStateError(
        "STALE_BRANCH_REF",
        `Workflow ${workflow.id} expects local branch ${workflow.branch}, but it no longer exists.`,
      );
    }
  }

  private resolveExecutor(stage: WorkflowTaskType): ExecutorSpec {
    const profileName = this.config.roles[stage] ?? "default";
    const profile = this.config.profiles[profileName] ?? {};
    return {
      executorId: mapExecutorId(profile.bin ?? this.config.runner.bin),
      profileName,
      provider: profile.provider ?? this.config.runner.provider,
      model: profile.model ?? this.config.runner.model,
      reasoning: (profile.reasoning ?? this.config.runner.reasoning) as ExecutorSpec["reasoning"],
      approvalMode: (profile.approval_mode ?? this.config.runner.approval_mode) as ExecutorSpec["approvalMode"],
    };
  }

  private async runVerifyReviewRepairLoop(
    workflow: WorkflowInstance,
    workItem: WorkItem,
  ): Promise<WorkflowInstance> {
    while (true) {
      workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "verify", status: "running" });
      workflow = await this.runStage(workflow, workItem, "verify");
      if (isFailureStatus(workflow.status)) {
        return workflow;
      }

      workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "review", status: "running" });
      workflow = await this.runStage(workflow, workItem, "review");
      if (isFailureStatus(workflow.status)) {
        return workflow;
      }

      const requiresRepair = await this.reviewRequiresRepair(workflow.id);
      if (!requiresRepair) {
        return workflow;
      }

      if (workflow.repairRound >= this.config.repair.max_rounds) {
        return this.store.updateWorkflowInstance(workflow.id, {
          stage: "repair",
          status: "failed",
        });
      }

      workflow = this.store.updateWorkflowInstance(workflow.id, {
        stage: "repair",
        status: "running",
        repairRound: workflow.repairRound + 1,
      });
      workflow = await this.runStage(workflow, workItem, "repair", {
        summary: `Address review findings for issue #${workItem.externalId}`,
        extraInstructions: [
          ...(await this.latestArtifactInstructions(workflow.id, "review-report", "Latest review report")),
          ...(await this.latestArtifactInstructions(workflow.id, "verification-report", "Latest verification report")),
        ],
      });
      if (isFailureStatus(workflow.status)) {
        return workflow;
      }
    }
  }

  private async reviewRequiresRepair(workflowId: string): Promise<boolean> {
    const reviewTask = [...this.store.listTasks(workflowId)].reverse().find((task) => task.type === "review");
    if (!reviewTask) {
      return false;
    }
    const result = this.store.getTaskResult(reviewTask.id);
    if (!result || result.result.status !== "success") {
      return true;
    }
    const reviewArtifact = this.store.listArtifacts(reviewTask.id).find((artifact) => artifact.kind === "review-report");
    if (!reviewArtifact) {
      return true;
    }
    const content = await readFile(reviewArtifact.path, "utf-8");
    const normalized = content.toLowerCase();
    if (normalized.includes("no defects found")) {
      return false;
    }
    return normalized.trim().length > 0;
  }

  private async latestArtifactInstructions(
    workflowId: string,
    kind: ArtifactKind,
    label: string,
  ): Promise<string[]> {
    const artifact = [...this.store.getWorkflowSnapshot(workflowId).artifacts]
      .reverse()
      .find((current) => current.kind === kind);
    if (!artifact) {
      return [];
    }
    const content = await readFile(artifact.path, "utf-8");
    return [`${label}:\n${content.trim()}`];
  }

  private async runStage(
    workflow: WorkflowInstance,
    workItem: WorkItem,
    stage: WorkflowTaskType,
    overrides: StageContextOverrides = {},
  ): Promise<WorkflowInstance> {
    const executor = this.resolveExecutor(stage);
    const task = this.store.createTask({
      workflowInstanceId: workflow.id,
      type: stage,
      status: "running",
      executorId: executor.executorId,
      runnerId: "local-runner",
    });

    const request: TaskExecutionRequest = {
      protocolVersion: PROTOCOL_VERSION,
      taskId: task.id,
      taskType: stage,
      project: {
        id: this.project.id,
        name: this.project.name,
        repoRoot: this.project.repoRoot,
        repoFullName: this.project.repoFullName,
      },
      workItem: {
        kind: "github-issue",
        externalId: workItem.externalId,
        title: workItem.title,
        url: workItem.url,
      },
      workspace: {
        sourceRepoPath: this.project.repoRoot,
        baseRef: workflow.baseSha,
        workBranch: workflow.branch,
        isolation: "git-worktree",
        readOnly: stage === "review",
      },
      executor,
      constraints: {
        maxIterations: this.config.runner.max_iterations,
        verifyCommands: stage === "verify" ? this.config.verify.commands : undefined,
      },
      context: {
        summary: overrides.summary ?? `${stage} for issue #${workItem.externalId}`,
        issueBody: overrides.issueBody ?? workItem.title,
        comments: overrides.comments,
        changedFilesHint: overrides.changedFilesHint,
        skills: resolveSkills(this.config, stage, overrides.changedFilesHint),
        extraInstructions: overrides.extraInstructions,
      },
      expectedArtifacts: [artifactKindForStage(stage)],
    };

    const { runId } = await this.runnerClient.startTask(request);
    const attempt = this.store.createAttempt({
      taskId: task.id,
      executorId: request.executor.executorId,
      runnerId: runId,
    });
    this.store.updateTask(task.id, {
      runnerId: runId,
      attemptIds: [...task.attemptIds, attempt.id],
    });

    await this.runnerClient.subscribe(runId, (event) => this.store.recordEvent(task.id, event));
    const result = await this.runnerClient.awaitResult(runId);
    const metadata = await this.runnerClient.inspect(runId);

    this.store.finishAttempt(attempt.id, {
      status: result.status === "success" ? "success" : result.status === "cancelled" ? "cancelled" : "failed",
      resultPath: metadata.resultPath,
      workspacePath: metadata.workspacePath,
    });
    this.store.recordArtifacts(task.id, result.artifacts);
    this.store.recordResult(task.id, result);
    this.store.updateTask(task.id, {
      status: result.status === "success" ? "completed" : result.status === "cancelled" ? "cancelled" : "failed",
    });

    if (result.status !== "success") {
      await this.runnerClient.cleanupRun(runId);
      return this.store.updateWorkflowInstance(workflow.id, {
        stage,
        status: result.status === "cancelled" ? "cancelled" : "failed",
      });
    }

    return this.store.getWorkflowInstance(workflow.id) ?? workflow;
  }

  private formatReviewComment(comment: { body: string; path?: string; line?: number; startLine?: number }): string {
    const location = this.reviewCommentLocation(comment);
    if (!location) {
      return comment.body;
    }
    return `${location}\n${comment.body}`;
  }

  private reviewCommentInstruction(comment: { body: string; path?: string; line?: number; startLine?: number }): string {
    const location = this.reviewCommentLocation(comment);
    if (!location) {
      return `GitHub review comment: ${comment.body}`;
    }
    return `GitHub review comment at ${location}: ${comment.body}`;
  }

  private reviewCommentLocation(comment: { path?: string; line?: number; startLine?: number }): string | null {
    if (!comment.path) {
      return null;
    }
    if (comment.startLine && comment.line && comment.startLine !== comment.line) {
      return `${comment.path}:${comment.startLine}-${comment.line}`;
    }
    if (comment.line) {
      return `${comment.path}:${comment.line}`;
    }
    return comment.path;
  }
}
