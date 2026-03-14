import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitHubGateway } from "../github/gateway.js";
import type { GitHubIssue } from "../github/types.js";
import {
  branchExists,
  loadBaselineManifest,
  readBranchHead,
  readCurrentBaselineSystemSnapshot,
} from "../baseline/manifest.js";
import type { ResolvedWorkflowConfig, WorkflowConfig } from "../workflow/config.js";
import { resolveSkills } from "../workflow/skill-resolver.js";
import { CanonicalStore } from "../persistence/canonical-store.js";
import type {
  PersistedExecutionResult,
  Project,
  RepairOutcome,
  WorkItem,
  WorkflowBaselineSnapshot,
  WorkflowInstance,
} from "../canonical/types.js";
import type {
  ArtifactKind,
  CapabilitySet,
  ContinuationSession,
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

type StatusArtifactMap = Partial<Record<
  "triage-report" | "plan" | "implementation-summary" | "verification-report" | "review-report" | "final-summary",
  string
>>;

type WorkflowStatusView = {
  workflowId: string;
  issue: { externalId: string; title: string; url: string };
  stage: WorkflowInstance["stage"];
  status: WorkflowInstance["status"];
  approvalPending: boolean;
  approvalStage?: WorkflowTaskType;
  statusReason?: string;
  artifacts: StatusArtifactMap;
  latestResult?: {
    taskType: WorkflowTaskType;
    status: TaskExecutionResult["status"];
    error?: TaskExecutionResult["error"];
  };
  approvalHistory: Array<{
    stage: WorkflowTaskType;
    status: "pending" | "approved" | "rejected";
    note?: string;
  }>;
  nextAction: string;
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

function isReadonlyStage(stage: WorkflowTaskType): boolean {
  return stage === "triage" || stage === "plan" || stage === "review";
}

function isFailureStatus(status: WorkflowInstance["status"]): boolean {
  return status === "failed" || status === "cancelled";
}

function shouldStopProgress(workflow: WorkflowInstance): boolean {
  return workflow.status !== "running";
}

function skipBaselineChecks(): boolean {
  return process.env.DEVAGENT_HUB_SKIP_BASELINE_CHECKS === "1";
}

export class WorkflowService {
  constructor(
    private readonly store: CanonicalStore,
    private readonly github: GitHubGateway,
    private readonly runnerClient: RunnerClient,
    private readonly project: Project,
    private readonly config: WorkflowConfig,
    private readonly configResolution: ResolvedWorkflowConfig = {
      config,
      source: "workflow-file",
      warnings: [],
      inferredVerifyCommands: [],
      detectedProjectKind: "unknown",
    },
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
    const workflow = await this.startDetached(issueExternalId);
    return this.continue(workflow.id);
  }

  async startDetached(issueExternalId: string): Promise<WorkflowInstance> {
    const workItem = await this.ensureIssue(issueExternalId);
    const repositoryId = `${this.project.id}:primary`;
    const branch = `devagent/workflow/${workItem.externalId}-${randomUUID().slice(0, 8)}`;
    const baselineSnapshot = this.captureBaselineSnapshot("main");
    return this.store.createWorkflowInstance({
      projectId: this.project.id,
      workspaceId: this.project.id,
      parentWorkItemId: workItem.id,
      workItemId: workItem.id,
      stage: "triage",
      status: "running",
      branch,
      baseBranch: baselineSnapshot.targetBranch,
      baseSha: baselineSnapshot.targetBaseSha,
      targetRepositoryIds: [repositoryId],
      baselineSnapshot,
    });
  }

  createLocalTask(input: {
    title: string;
    description?: string;
    repositoryId?: string;
    labels?: string[];
  }): WorkItem {
    return this.store.createLocalTask({
      workspaceId: this.project.id,
      repositoryId: input.repositoryId,
      title: input.title,
      description: input.description,
      labels: input.labels,
    });
  }

  async importReviewable(input: {
    workspaceId: string;
    repositoryId: string;
    externalId: string;
    title?: string;
    url?: string;
    state?: string;
  }) {
    const workspace = this.store.getWorkspace(input.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${input.workspaceId} not found`);
    }
    const repository = this.store.getRepository(input.repositoryId);
    if (!repository) {
      throw new Error(`Repository ${input.repositoryId} not found`);
    }
    if (repository.workspaceId !== workspace.id) {
      throw new Error(`Repository ${input.repositoryId} does not belong to workspace ${input.workspaceId}`);
    }

    const needsRemoteMetadata = !input.title || !input.url;
    const canFetchRemoteMetadata = repository.provider === "github" && Boolean(repository.repoFullName);
    if (needsRemoteMetadata && !canFetchRemoteMetadata) {
      throw new Error(
        `Repository ${input.repositoryId} lacks GitHub metadata; provide both --title and --url to import this reviewable.`,
      );
    }

    const pr = (!input.title || !input.url)
      ? await this.github.fetchPR(repository.repoFullName!, Number(input.externalId))
      : null;
    const timestamp = new Date().toISOString();
    return this.store.upsertReviewable({
      id: `${input.workspaceId}:reviewable:${input.repositoryId}:${input.externalId}`,
      workspaceId: input.workspaceId,
      repositoryId: input.repositoryId,
      provider: "github",
      type: "github-pr",
      externalId: input.externalId,
      title: input.title ?? pr?.title ?? `Imported PR #${input.externalId}`,
      url: input.url ?? pr?.url ?? `https://github.com/${repository.repoFullName}/pull/${input.externalId}`,
      state: input.state ?? pr?.state,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  getReviewable(reviewableId: string) {
    const reviewable = this.store.getReviewable(reviewableId);
    if (!reviewable) {
      throw new Error(`Reviewable ${reviewableId} not found`);
    }
    return reviewable;
  }

  async startForWorkItem(workItemId: string, targetRepositoryIds?: string[]): Promise<WorkflowInstance> {
    const workflow = await this.startDetachedForWorkItem(workItemId, targetRepositoryIds);
    return this.continue(workflow.id);
  }

  async startDetachedForWorkItem(workItemId: string, targetRepositoryIds?: string[]): Promise<WorkflowInstance> {
    const workItem = this.getWorkItem(workItemId);
    const activeWorkflow = this.findActiveWorkflowForWorkItem(workItem.id);
    if (activeWorkflow) {
      return activeWorkflow;
    }
    if (workItem.kind === "github-issue") {
      return this.startDetached(workItem.externalId);
    }

    const repositoryId = targetRepositoryIds?.[0] ?? workItem.repositoryId ?? `${this.project.id}:primary`;
    const branch = `devagent/workflow/${workItem.externalId}-${randomUUID().slice(0, 8)}`;
    const baselineSnapshot = this.captureBaselineSnapshot("main");
    const workflow = this.store.createWorkflowInstance({
      projectId: this.project.id,
      workspaceId: this.project.id,
      parentWorkItemId: workItem.id,
      workItemId: workItem.id,
      stage: "triage",
      status: "running",
      branch,
      baseBranch: baselineSnapshot.targetBranch,
      baseSha: baselineSnapshot.targetBaseSha,
      targetRepositoryIds: targetRepositoryIds?.length ? targetRepositoryIds : [repositoryId],
      baselineSnapshot,
    });
    return workflow;
  }

  async continue(workflowId: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    const workItem = this.getWorkItem(workflow.workItemId);

    if (workflow.status !== "running") {
      return workflow;
    }

    this.assertWorkflowContinuationSafe(workflow, workflow.stage !== "triage");

    switch (workflow.stage) {
      case "triage":
        workflow = await this.runStage(workflow, workItem, "triage");
        if (shouldStopProgress(workflow)) {
          return workflow;
        }
        workflow = this.store.updateWorkflowInstance(workflow.id, {
          stage: "plan",
          status: "running",
          statusReason: undefined,
        });
        workflow = await this.runStage(workflow, workItem, "plan");
        if (isFailureStatus(workflow.status)) {
          return workflow;
        }
        this.store.createApproval({ workflowInstanceId: workflow.id, stage: "plan" });
        return this.store.updateWorkflowInstance(workflow.id, {
          stage: "plan",
          status: "waiting_approval",
          statusReason: undefined,
        });
      case "plan":
        workflow = await this.runStage(workflow, workItem, "plan");
        if (isFailureStatus(workflow.status)) {
          return workflow;
        }
        this.store.createApproval({ workflowInstanceId: workflow.id, stage: "plan" });
        return this.store.updateWorkflowInstance(workflow.id, {
          stage: "plan",
          status: "waiting_approval",
          statusReason: undefined,
        });
      case "implement":
        workflow = await this.runStage(workflow, workItem, "implement");
        if (shouldStopProgress(workflow)) {
          return workflow;
        }
        workflow = await this.runVerifyReviewRepairLoop(workflow, workItem);
        return workflow.status === "running"
          ? this.pauseForReviewApproval(workflow)
          : workflow;
      case "verify":
      case "review":
      case "repair":
        workflow = await this.runVerifyReviewRepairLoop(workflow, workItem);
        return workflow.status === "running"
          ? this.pauseForReviewApproval(workflow)
          : workflow;
      case "done":
        return workflow;
    }
  }

  async resume(workflowId: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    this.assertWorkflowContinuationSafe(workflow, true);
    const pending = this.store.getPendingApproval(workflowId);
    const workItem = this.getWorkItem(workflow.workItemId);

    if (!pending || !["plan", "implement", "repair"].includes(pending.stage)) {
      throw new Error("Workflow is not waiting on a resumable approval");
    }

    this.store.updateApproval(pending.id, "approved", "Approved via run resume");

    if (pending.stage === "plan") {
      workflow = this.store.updateWorkflowInstance(workflow.id, {
        stage: "implement",
        status: "running",
        statusReason: undefined,
      });
      workflow = await this.runStage(workflow, workItem, "implement");
      if (shouldStopProgress(workflow)) {
        return workflow;
      }
    } else {
      workflow = this.store.updateWorkflowInstance(workflow.id, {
        stage: pending.stage,
        status: "running",
        statusReason: undefined,
      });
    }

    workflow = await this.runVerifyReviewRepairLoop(workflow, workItem);
    if (shouldStopProgress(workflow)) {
      return workflow;
    }

    this.store.createApproval({ workflowInstanceId: workflow.id, stage: "review" });
    return this.store.updateWorkflowInstance(workflow.id, {
      stage: "review",
      status: "waiting_approval",
      statusReason: undefined,
    });
  }

  async reject(workflowId: string, note: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    this.assertWorkflowContinuationSafe(workflow, true);
    const pending = this.store.getPendingApproval(workflowId);
    const workItem = this.getWorkItem(workflow.workItemId);

    if (!pending) {
      throw new Error("Workflow is not waiting on an approval");
    }

    this.store.updateApproval(pending.id, "rejected", note);

    if (pending.stage === "plan") {
      workflow = this.store.updateWorkflowInstance(workflow.id, {
        stage: "plan",
        status: "running",
        statusReason: undefined,
      });
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
      return this.store.updateWorkflowInstance(workflow.id, {
        stage: "plan",
        status: "waiting_approval",
        statusReason: undefined,
      });
    }

    if (pending.stage === "review") {
      workflow = this.store.updateWorkflowInstance(workflow.id, {
        stage: "repair",
        status: "running",
        statusReason: undefined,
      });
      workflow = await this.runStage(workflow, workItem, "repair", {
        summary: `Address rejected review approval for issue #${workItem.externalId}`,
        extraInstructions: [
          `Human rejected the pre-PR review approval and requested changes: ${note}`,
          ...(await this.latestArtifactInstructions(workflow.id, "review-report", "Latest review report")),
        ],
      });
      if (shouldStopProgress(workflow)) {
        return workflow;
      }

      workflow = await this.runVerifyReviewRepairLoop(workflow, workItem);
      if (shouldStopProgress(workflow)) {
        return workflow;
      }

      this.store.createApproval({ workflowInstanceId: workflow.id, stage: "review" });
      return this.store.updateWorkflowInstance(workflow.id, {
        stage: "review",
        status: "waiting_approval",
        statusReason: undefined,
      });
    }

    throw new Error(`Reject is not supported for approval stage ${pending.stage}`);
  }

  async openPr(workflowId: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    this.assertWorkflowContinuationSafe(workflow, true);
    const pending = this.store.getPendingApproval(workflowId);
    const snapshot = this.store.getWorkflowSnapshot(workflow.id);
    const latestReviewApproval = [...snapshot.approvals].reverse().find((approval) => approval.stage === "review");
    const canResumeApprovedOpen =
      workflow.stage === "review" &&
      workflow.status === "waiting_approval" &&
      !workflow.prNumber &&
      latestReviewApproval?.status === "approved";

    if (pending?.stage === "review") {
      this.store.updateApproval(pending.id, "approved", "Approved via pr open");
    } else if (!canResumeApprovedOpen) {
      throw new Error("Workflow is not waiting on final approval");
    }

    const workItem = this.getWorkItem(workflow.workItemId);
    const attempts = snapshot.attempts;
    const latestAttempt = attempts.at(-1);
    if (!latestAttempt?.workspacePath) throw new Error("No workspace available for PR handoff");
    const branch = this.store.getWorkflowBranch(workflow.id);
    const pushRepoRoot = this.resolveWorkspacePrimaryRepoPath(workflow, latestAttempt.workspacePath);

    await this.github.pushBranch(pushRepoRoot, branch);
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
      statusReason: undefined,
    });
    await this.runnerClient.cleanupRun(latestAttempt.runnerId);
    return workflow;
  }

  async repairPr(workflowId: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    this.assertWorkflowContinuationSafe(workflow, true);
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
    const actionableComments = pr.reviewComments.filter((comment) => comment.isResolved !== true);
    const unresolvedCommentCount = actionableComments.length;
    const ciFailureCount = ciFailureLogs.length;
    const changedFilesHint = [...new Set(actionableComments.flatMap((comment) => (comment.path ? [comment.path] : [])))];

    if (actionableComments.length === 0 && ciFailureLogs.length === 0) {
      throw new Error(`PR #${workflow.prNumber} has no unresolved review comments or failing CI checks to repair`);
    }

    workflow = this.store.updateWorkflowInstance(workflow.id, {
      stage: "repair",
      status: "running",
      statusReason: undefined,
    });
    workflow = await this.runStage(workflow, workItem, "repair", {
      summary: `Repair PR #${pr.number} feedback for issue #${workItem.externalId}`,
      issueBody: [
        `PR: ${pr.url}`,
        `Address the unresolved GitHub review comments and failing CI checks for branch ${pr.head}.`,
      ].join("\n"),
      comments: actionableComments.map((comment) => ({
        author: comment.author,
        body: this.formatReviewComment(comment),
      })),
      changedFilesHint,
      extraInstructions: [
        `Resolve the unresolved feedback on PR #${pr.number}. Do not mark review threads resolved automatically; leave that to the operator after verifying the fix.`,
        ...actionableComments.map((comment) => this.reviewCommentInstruction(comment)),
        ...ciFailureLogs.map((failure) => `CI failure in ${failure.check}:\n${failure.log}`),
      ],
    });
    if (shouldStopProgress(workflow)) {
      return workflow;
    }

    workflow = await this.runVerifyReviewRepairLoop(workflow, workItem);
    if (shouldStopProgress(workflow)) {
      return workflow;
    }

    const latestAttempt = [...this.store.getWorkflowSnapshot(workflow.id).attempts]
      .reverse()
      .find((attempt) => attempt.status === "success" && attempt.workspacePath);
    if (!latestAttempt?.workspacePath) {
      throw new Error("No workspace available for PR repair handoff");
    }

    const branch = this.store.getWorkflowBranch(workflow.id);
    const pushRepoRoot = this.resolveWorkspacePrimaryRepoPath(workflow, latestAttempt.workspacePath);
    const pushResult = await this.github.pushBranch(pushRepoRoot, branch, "fix: address PR feedback");
    this.recordRepairOutcome(workflow.id, {
      unresolvedCommentCount,
      ciFailureCount,
      pushedCommit: pushResult.pushedCommit,
      pushedSha: pushResult.pushedSha,
    });
    await this.runnerClient.cleanupRun(latestAttempt.runnerId);
    return this.store.updateWorkflowInstance(workflow.id, {
      stage: "done",
      status: "completed",
      statusReason: undefined,
    });
  }

  listWorkflows(): WorkflowInstance[] {
    return this.store.listWorkflowInstances();
  }

  getSnapshot(workflowId: string) {
    return this.store.getWorkflowSnapshot(workflowId);
  }

  getStatusView(workflowId: string): WorkflowStatusView {
    const snapshot = this.store.getWorkflowSnapshot(workflowId);
    const pending = this.store.getPendingApproval(workflowId);
    const artifacts: StatusArtifactMap = {};
    for (const artifact of snapshot.artifacts) {
      artifacts[artifact.kind] = artifact.path;
    }

    const latestResult = [...snapshot.tasks]
      .reverse()
      .map((task) => {
        const result = this.store.getTaskResult(task.id);
        return result
          ? {
              taskType: task.type,
              status: result.result.status,
              error: result.result.error,
            }
          : undefined;
      })
      .find((result) => result !== undefined);

    return {
      workflowId: snapshot.workflow.id,
      issue: {
        externalId: snapshot.workItem.externalId,
        title: snapshot.workItem.title,
        url: snapshot.workItem.url ?? "",
      },
      stage: snapshot.workflow.stage,
      status: snapshot.workflow.status,
      approvalPending: Boolean(pending),
      approvalStage: pending?.stage,
      statusReason: snapshot.workflow.statusReason,
      artifacts,
      latestResult,
      approvalHistory: snapshot.approvals.map((approval) => ({
        stage: approval.stage,
        status: approval.status,
        note: approval.note,
      })),
      nextAction: this.nextAction(snapshot.workflow, pending),
    };
  }

  async cancel(workflowId: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    if (workflow.status !== "running") {
      return workflow;
    }

    let snapshot = this.store.getWorkflowSnapshot(workflow.id);
    const runningAttempt = [...snapshot.attempts].reverse().find((attempt) => attempt.status === "running");
    if (!runningAttempt) {
      return workflow;
    }

    await this.runnerClient.cancel(runningAttempt.runnerId);

    workflow = this.store.getWorkflowInstance(workflowId) ?? workflow;
    snapshot = this.store.getWorkflowSnapshot(workflow.id);
    const stillRunning = workflow.status === "running"
      && snapshot.attempts.some((attempt) => attempt.status === "running");
    if (!stillRunning) {
      return workflow;
    }

    return this.store.updateWorkflowInstance(workflow.id, {
      status: "cancelled",
      statusReason: "Cancelled by operator.",
    });
  }

  private upsertIssue(issue: GitHubIssue): WorkItem {
    return this.store.upsertWorkItem({
      id: issueId(this.project.id, issue),
      workspaceId: this.project.id,
      projectId: this.project.id,
      repositoryId: `${this.project.id}:primary`,
      kind: "github-issue",
      externalId: String(issue.number),
      title: issue.title,
      state: issue.state,
      labels: [...issue.labels],
      url: issue.url,
      description: issue.title,
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

    if (skipBaselineChecks()) {
      return {
        targetBranch: baseBranch,
        targetBaseSha: readBranchHead(this.project.repoRoot, baseBranch),
        system: current,
      };
    }

    return {
      targetBranch: baseBranch,
      targetBaseSha: readBranchHead(this.project.repoRoot, baseBranch),
      system: current,
    };
  }

  markWorkflowFailed(workflowId: string, message: string): WorkflowInstance {
    const workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    return this.store.updateWorkflowInstance(workflowId, {
      status: "failed",
      statusReason: message,
    });
  }

  getLatestContinuationSession(
    workflowId: string,
    stages?: WorkflowTaskType[],
  ): ContinuationSession | undefined {
    const stageSet = stages ? new Set(stages) : null;
    const tasks = [...this.store.listTasks(workflowId)].reverse();
    for (const task of tasks) {
      if (stageSet && !stageSet.has(task.type)) {
        continue;
      }
      const attempts = [...this.store.listAttempts(task.id)].reverse();
      for (const attempt of attempts) {
        if (attempt.session) {
          return attempt.session;
        }
      }
    }
    return undefined;
  }

  private assertWorkflowContinuationSafe(
    workflow: WorkflowInstance,
    requireWorkBranch: boolean,
  ): void {
    if (skipBaselineChecks()) {
      return;
    }

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

    if (requireWorkBranch && !branchExists(this.project.repoRoot, workflow.branch)) {
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

  private inferredConfigInstructions(stage: WorkflowTaskType): string[] {
    if (!["triage", "plan", "implement"].includes(stage)) {
      return [];
    }
    if (this.configResolution.source === "workflow-file") {
      return [];
    }
    const verifyCommands = this.configResolution.inferredVerifyCommands.length > 0
      ? this.configResolution.inferredVerifyCommands.join(", ")
      : "none";
    return [
      `Hub inferred workflow defaults because WORKFLOW.md is missing.`,
      `Detected project kind: ${this.configResolution.detectedProjectKind}.`,
      `Inferred verify commands: ${verifyCommands}.`,
      ...this.configResolution.warnings,
      "Do not assume Bun-based commands unless the inferred project kind is bun.",
    ];
  }

  private findActiveWorkflowForWorkItem(workItemId: string): WorkflowInstance | undefined {
    return this.store.listWorkflowInstances().find((workflow) =>
      workflow.workItemId === workItemId &&
      !workflow.archivedAt &&
      !workflow.supersededByWorkflowId &&
      (workflow.status === "queued" || workflow.status === "running" || workflow.status === "waiting_approval"),
    );
  }

  private async runVerifyReviewRepairLoop(
    workflow: WorkflowInstance,
    workItem: WorkItem,
  ): Promise<WorkflowInstance> {
    while (true) {
      if (workflow.stage === "implement" || workflow.stage === "repair") {
        workflow = this.store.updateWorkflowInstance(workflow.id, {
          stage: "verify",
          status: "running",
          statusReason: undefined,
        });
      }
      if (workflow.stage === "verify") {
        workflow = await this.runStage(workflow, workItem, "verify");
        if (shouldStopProgress(workflow)) {
          return workflow;
        }
        workflow = this.store.updateWorkflowInstance(workflow.id, {
          stage: "review",
          status: "running",
          statusReason: undefined,
        });
      }
      if (workflow.stage === "review") {
        workflow = await this.runStage(workflow, workItem, "review");
        if (shouldStopProgress(workflow)) {
          return workflow;
        }
      }

      const requiresRepair = await this.reviewRequiresRepair(workflow.id);
      if (!requiresRepair) {
        return workflow;
      }

      if (workflow.repairRound >= this.config.repair.max_rounds) {
        return this.store.updateWorkflowInstance(workflow.id, {
          stage: "repair",
          status: "failed",
          statusReason: `Repair loop exceeded max rounds (${this.config.repair.max_rounds}).`,
        });
      }

      workflow = this.store.updateWorkflowInstance(workflow.id, {
        stage: "repair",
        status: "running",
        statusReason: undefined,
        repairRound: workflow.repairRound + 1,
      });
      workflow = await this.runStage(workflow, workItem, "repair", {
        summary: `Address review findings for issue #${workItem.externalId}`,
        extraInstructions: [
          ...(await this.latestArtifactInstructions(workflow.id, "review-report", "Latest review report")),
          ...(await this.latestArtifactInstructions(workflow.id, "verification-report", "Latest verification report")),
        ],
      });
      if (shouldStopProgress(workflow)) {
        return workflow;
      }
    }
  }

  private pauseForReviewApproval(workflow: WorkflowInstance): WorkflowInstance {
    this.store.createApproval({ workflowInstanceId: workflow.id, stage: "review" });
    return this.store.updateWorkflowInstance(workflow.id, {
      stage: "review",
      status: "waiting_approval",
      statusReason: undefined,
    });
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

  private recordRepairOutcome(workflowId: string, repairOutcome: RepairOutcome): void {
    const repairTask = [...this.store.listTasks(workflowId)]
      .reverse()
      .find((task) => task.type === "repair");
    if (!repairTask) {
      return;
    }
    const existingResult = this.store.getTaskResult(repairTask.id);
    if (!existingResult) {
      return;
    }
    const nextResult: PersistedExecutionResult = {
      ...existingResult.result,
      repairOutcome,
    };
    this.store.recordResult(repairTask.id, nextResult);
  }

  private async runStage(
    workflow: WorkflowInstance,
    workItem: WorkItem,
    stage: WorkflowTaskType,
    overrides: StageContextOverrides = {},
  ): Promise<WorkflowInstance> {
    const extraInstructions = [
      ...(overrides.extraInstructions ?? []),
      ...this.inferredConfigInstructions(stage),
    ];
    if (stage === "triage" || stage === "plan") {
      extraInstructions.push(
        "Do not modify files.",
        "Do not run verification commands.",
        "Only inspect current state and produce the requested artifact.",
      );
    }
    if (stage === "implement") {
      extraInstructions.push(...(await this.latestArtifactInstructions(workflow.id, "plan", "Accepted plan")));
    }
    const executor = this.resolveExecutor(stage);
    const task = this.store.createTask({
      workflowInstanceId: workflow.id,
      type: stage,
      status: "running",
      executorId: executor.executorId,
      runnerId: "local-runner",
    });

    const repositories = this.store.listRepositories(this.project.id);
    const primaryRepository = repositories.find((repository) => repository.id === `${this.project.id}:primary`) ?? {
      id: `${this.project.id}:primary`,
      workspaceId: this.project.id,
      alias: "primary",
      name: this.project.name,
      repoRoot: this.project.repoRoot,
      repoFullName: this.project.repoFullName,
      defaultBranch: workflow.baseBranch,
      provider: "github" as const,
    };
    const repositoryRefs = repositories.length > 0 ? repositories : [primaryRepository];
    const targetRepositoryIds = workflow.targetRepositoryIds?.length ? workflow.targetRepositoryIds : [primaryRepository.id];
    const targetRepositoryIdSet = new Set(targetRepositoryIds);
    const pinnedRepositoryBaseRefs = new Map<string, string | undefined>([
      [primaryRepository.alias, workflow.baseSha],
      ["devagent-sdk", workflow.baselineSnapshot.system.sdkSha],
      ["devagent-runner", workflow.baselineSnapshot.system.runnerSha],
      ["devagent", workflow.baselineSnapshot.system.devagentSha],
    ]);
    const executionRepositories = repositoryRefs.map((repository) => {
      const isTargetRepository = targetRepositoryIdSet.has(repository.id);
      return {
        repositoryId: repository.id,
        alias: repository.alias,
        sourceRepoPath: repository.repoRoot,
        baseRef: pinnedRepositoryBaseRefs.get(repository.alias),
        workBranch: workflow.branch,
        isolation: "git-worktree",
        readOnly: isReadonlyStage(stage) || !isTargetRepository,
      } as const;
    });
    const capabilities: CapabilitySet = {
      canSyncTasks: true,
      canCreateTask: true,
      canComment: true,
      canReview: true,
      canMerge: true,
      canOpenReviewable: true,
    };
    const reviewable = workflow.reviewableId ? this.store.getReviewable(workflow.reviewableId) : undefined;

    const baseRequest = {
      protocolVersion: PROTOCOL_VERSION,
      taskType: stage,
      workspaceRef: {
        id: this.project.id,
        name: this.project.name,
        provider: "github",
        primaryRepositoryId: primaryRepository.id,
      },
      repositories: repositoryRefs,
      workItem: {
        id: workItem.id,
        kind: workItem.kind,
        externalId: workItem.externalId,
        title: workItem.title,
        url: workItem.url,
        repositoryId: workItem.repositoryId ?? primaryRepository.id,
        state: workItem.state,
        labels: workItem.labels,
      },
      reviewable: reviewable
        ? {
            id: reviewable.id,
            provider: reviewable.provider,
            type: reviewable.type,
            externalId: reviewable.externalId,
            title: reviewable.title,
            url: reviewable.url,
            repositoryId: reviewable.repositoryId,
          }
        : undefined,
      execution: {
        primaryRepositoryId: primaryRepository.id,
        repositories: executionRepositories,
      },
      targetRepositoryIds,
      executor,
      constraints: {
        maxIterations: this.config.runner.max_iterations,
        timeoutSec: this.config.budget.stage_wall_time_minutes * 60,
        verifyCommands: stage === "verify" ? this.config.verify.commands : undefined,
      },
      capabilities,
      context: {
        summary: overrides.summary ?? `${stage} for issue #${workItem.externalId}`,
        issueBody: overrides.issueBody ?? workItem.description ?? workItem.title,
        comments: overrides.comments,
        changedFilesHint: overrides.changedFilesHint,
        skills: resolveSkills(this.config, stage, overrides.changedFilesHint),
      },
      expectedArtifacts: [artifactKindForStage(stage)],
    } satisfies Omit<TaskExecutionRequest, "taskId">;

    const maxAttempts = stage === "implement" || stage === "repair" ? 2 : 1;
    let retryInstruction: string | undefined;
    let continuation: TaskExecutionRequest["continuation"] | undefined;
    let attemptIds = [...task.attemptIds];

    for (let attemptIndex = 1; attemptIndex <= maxAttempts; attemptIndex += 1) {
      const request: TaskExecutionRequest = {
        ...baseRequest,
        taskId: attemptIndex === 1 ? task.id : `${task.id}:retry-${attemptIndex - 1}`,
        continuation,
        context: {
          ...baseRequest.context,
          extraInstructions: [
            ...extraInstructions,
            ...(retryInstruction ? [retryInstruction] : []),
          ].filter(Boolean),
        },
      };

      const { runId } = await this.runnerClient.startTask(request);
      const attempt = this.store.createAttempt({
        taskId: task.id,
        executorId: request.executor.executorId,
        runnerId: runId,
      });
      attemptIds = [...attemptIds, attempt.id];
      this.store.updateTask(task.id, {
        runnerId: runId,
        attemptIds,
      });
      const initialMetadata = await this.runnerClient.inspect(runId);
      this.store.updateAttemptMetadata(attempt.id, {
        workspacePath: initialMetadata.workspacePath,
        eventLogPath: initialMetadata.eventLogPath,
      });

      await this.runnerClient.subscribe(runId, (event) => this.store.recordEvent(task.id, event));
      const result = await this.runnerClient.awaitResult(runId);
      const metadata = await this.runnerClient.inspect(runId);

      this.store.finishAttempt(attempt.id, {
        status: result.status === "success" ? "success" : result.status === "cancelled" ? "cancelled" : "failed",
        resultPath: metadata.resultPath,
        workspacePath: metadata.workspacePath,
        eventLogPath: metadata.eventLogPath,
        session: result.session,
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
          statusReason: result.error?.message,
        });
      }

      if (stage === "implement" || stage === "repair") {
        const changedFiles = this.readChangedFiles(workflow, metadata.workspacePath);
        if (changedFiles.length === 0) {
          const outcomeReason = result.outcomeReason ?? "no_repo_changes";
          const noProgressResult: PersistedExecutionResult = {
            ...result,
            outcome: "no_progress",
            outcomeReason,
          };
          this.store.recordResult(task.id, noProgressResult);
          await this.runnerClient.cleanupRun(runId);

          const causeSuffix = outcomeReason === "no_repo_changes" ? "" : ` (executor reported ${outcomeReason})`;
          if (attemptIndex < maxAttempts) {
            retryInstruction =
              `The previous ${stage} attempt produced no repository changes${causeSuffix}. Continue and make the requested code changes before finishing.`;
            continuation = executor.executorId === "devagent" && result.session
              ? {
                  mode: "resume",
                  reason: "retry_no_progress",
                  instructions: retryInstruction,
                  session: result.session,
                }
              : undefined;
            this.store.updateTask(task.id, {
              status: "running",
            });
            continue;
          }

          return this.store.updateWorkflowInstance(workflow.id, {
            stage,
            status: "failed",
            statusReason: `${stage} produced no repository changes after retry${causeSuffix}.`,
          });
        }
      }

      const gatedWorkflow = this.enforceReviewPolicy(workflow, stage, metadata.workspacePath);
      if (gatedWorkflow) {
        return gatedWorkflow;
      }

      return this.store.getWorkflowInstance(workflow.id) ?? workflow;
    }

    return this.store.getWorkflowInstance(workflow.id) ?? workflow;
  }

  private enforceReviewPolicy(
    workflow: WorkflowInstance,
    stage: WorkflowTaskType,
    workspacePath: string,
  ): WorkflowInstance | null {
    if (stage !== "implement" && stage !== "repair") {
      return null;
    }

    const changedFiles = this.readChangedFiles(workflow, workspacePath);
    if (changedFiles.length === 0) {
      return null;
    }
    const patchBytes = this.readPatchBytes(workflow, workspacePath);

    if (changedFiles.length > this.config.review.run_max_changed_files) {
      return this.store.updateWorkflowInstance(workflow.id, {
        stage,
        status: "failed",
        statusReason: `Changed files (${changedFiles.length}) exceed review.run_max_changed_files (${this.config.review.run_max_changed_files}). Manual intervention required.`,
      });
    }

    if (patchBytes > this.config.review.run_max_patch_bytes) {
      return this.store.updateWorkflowInstance(workflow.id, {
        stage,
        status: "failed",
        statusReason: `Patch size (${patchBytes} bytes) exceeds review.run_max_patch_bytes (${this.config.review.run_max_patch_bytes}). Manual intervention required.`,
      });
    }

    if (changedFiles.length > this.config.review.max_changed_files) {
      this.store.createApproval({
        workflowInstanceId: workflow.id,
        stage,
        note: `Changed files (${changedFiles.length}) exceed review.max_changed_files (${this.config.review.max_changed_files}). Inspect the diff and artifacts before continuing.`,
      });
      return this.store.updateWorkflowInstance(workflow.id, {
        stage,
        status: "waiting_approval",
        statusReason: `Changed files (${changedFiles.length}) exceed review.max_changed_files (${this.config.review.max_changed_files}). Manual approval required before continuing.`,
      });
    }

    if (patchBytes > this.config.review.max_patch_bytes) {
      this.store.createApproval({
        workflowInstanceId: workflow.id,
        stage,
        note: `Patch size (${patchBytes} bytes) exceeds review.max_patch_bytes (${this.config.review.max_patch_bytes}). Inspect the diff and artifacts before continuing.`,
      });
      return this.store.updateWorkflowInstance(workflow.id, {
        stage,
        status: "waiting_approval",
        statusReason: `Patch size (${patchBytes} bytes) exceeds review.max_patch_bytes (${this.config.review.max_patch_bytes}). Manual approval required before continuing.`,
      });
    }

    return null;
  }

  private readChangedFiles(workflow: WorkflowInstance, workspacePath: string): string[] {
    const primaryRepoPath = this.resolveWorkspacePrimaryRepoPath(workflow, workspacePath);
    const markerPaths = [
      join(workspacePath, ".devagent-changed-files.json"),
      join(primaryRepoPath, ".devagent-changed-files.json"),
    ];
    for (const markerPath of markerPaths) {
      if (!existsSync(markerPath)) {
        continue;
      }
      const raw = readFileSync(markerPath, "utf-8");
      return [...new Set((JSON.parse(raw) as string[]).filter(Boolean))];
    }

    const candidates: Array<{ cwd: string; args: string[] }> = [
      {
        cwd: primaryRepoPath,
        args: ["diff", "--name-only", workflow.baseSha],
      },
      {
        cwd: this.project.repoRoot,
        args: ["diff", "--name-only", workflow.baseSha, workflow.branch],
      },
    ];

    for (const candidate of candidates) {
      if (!existsSync(join(candidate.cwd, ".git"))) {
        continue;
      }
      try {
        const output = execFileSync("git", candidate.args, {
          cwd: candidate.cwd,
          encoding: "utf-8",
        }).trim();
        if (!output) {
          continue;
        }
        return [...new Set(output.split("\n").map((line) => line.trim()).filter(Boolean))];
      } catch {
        // Try the next strategy.
      }
    }

    return [];
  }

  private resolveWorkspacePrimaryRepoPath(workflow: WorkflowInstance, workspacePath: string): string {
    const primaryRepositoryId =
      workflow.targetRepositoryIds?.[0]
      ?? `${this.project.id}:primary`;
    const primaryRepository = this.store.getRepository(primaryRepositoryId);
    const alias = primaryRepository?.alias ?? "primary";
    const candidate = join(workspacePath, "repos", alias);
    if (existsSync(join(candidate, ".git"))) {
      return candidate;
    }
    return workspacePath;
  }

  private readPatchBytes(workflow: WorkflowInstance, workspacePath: string): number {
    const primaryRepoPath = this.resolveWorkspacePrimaryRepoPath(workflow, workspacePath);
    const markerPaths = [
      join(workspacePath, ".devagent-patch-bytes.txt"),
      join(primaryRepoPath, ".devagent-patch-bytes.txt"),
    ];
    for (const markerPath of markerPaths) {
      if (!existsSync(markerPath)) {
        continue;
      }
      const raw = Number.parseInt(readFileSync(markerPath, "utf-8").trim(), 10);
      return Number.isFinite(raw) ? raw : 0;
    }

    const candidates: Array<{ cwd: string; args: string[] }> = [
      {
        cwd: primaryRepoPath,
        args: ["diff", "--binary", workflow.baseSha],
      },
      {
        cwd: this.project.repoRoot,
        args: ["diff", "--binary", workflow.baseSha, workflow.branch],
      },
    ];

    for (const candidate of candidates) {
      if (!existsSync(join(candidate.cwd, ".git"))) {
        continue;
      }
      try {
        const output = execFileSync("git", candidate.args, {
          cwd: candidate.cwd,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });
        return Buffer.byteLength(output, "utf-8");
      } catch {
        // Try the next strategy.
      }
    }

    return 0;
  }

  private nextAction(
    workflow: WorkflowInstance,
    pending: ReturnType<CanonicalStore["getPendingApproval"]>,
  ): string {
    if (pending?.stage === "plan") {
      return `Review plan.md, then run 'devagent-hub run resume ${workflow.id}' or 'devagent-hub run reject ${workflow.id} --note \"...\"'.`;
    }
    if (pending?.stage === "review") {
      return `Review verification-report.md and review-report.md, then run 'devagent-hub pr open ${workflow.id}' or 'devagent-hub run reject ${workflow.id} --note \"...\"'.`;
    }
    if (pending?.stage === "implement" || pending?.stage === "repair") {
      return `Inspect the diff and latest artifacts, then run 'devagent-hub run resume ${workflow.id}' to continue or 'devagent-hub run cancel ${workflow.id}' to stop.`;
    }
    if (workflow.status === "failed") {
      return "Inspect the latest result and status reason before retrying or starting a fresh workflow.";
    }
    if (workflow.status === "completed") {
      return workflow.prUrl ? `Workflow is complete. Review the PR at ${workflow.prUrl}.` : "Workflow is complete.";
    }
    if (workflow.status === "cancelled") {
      return "Workflow is cancelled. Start a new run if more changes are needed.";
    }
    return "Workflow is running. Re-run 'devagent-hub status <workflow-id>' to refresh progress.";
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
