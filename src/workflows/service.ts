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

function isFailureStatus(status: WorkflowInstance["status"]): boolean {
  return status === "failed" || status === "cancelled";
}

function shouldStopProgress(workflow: WorkflowInstance): boolean {
  return workflow.status !== "running";
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
  }

  async resume(workflowId: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    this.assertWorkflowContinuationSafe(workflow);
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
    this.assertWorkflowContinuationSafe(workflow);
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
      statusReason: undefined,
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

    workflow = this.store.updateWorkflowInstance(workflow.id, {
      stage: "repair",
      status: "running",
      statusReason: undefined,
    });
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
    await this.github.pushBranch(latestAttempt.workspacePath, branch, "fix: address PR feedback");
    await this.github.resolveReviewThreads(
      this.project.repoFullName,
      prNumber,
      pr.reviewComments.flatMap((comment) => (comment.nodeId ? [comment.nodeId] : [])),
    );
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
        url: snapshot.workItem.url,
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
      current.devagentSha !== expected["devagent"].sha
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
      workflow = this.store.updateWorkflowInstance(workflow.id, {
        stage: "verify",
        status: "running",
        statusReason: undefined,
      });
      workflow = await this.runStage(workflow, workItem, "verify");
      if (shouldStopProgress(workflow)) {
        return workflow;
      }

      workflow = this.store.updateWorkflowInstance(workflow.id, {
        stage: "review",
        status: "running",
        statusReason: undefined,
      });
      workflow = await this.runStage(workflow, workItem, "review");
      if (shouldStopProgress(workflow)) {
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
    const extraInstructions = [...(overrides.extraInstructions ?? [])];
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
        timeoutSec: this.config.budget.stage_wall_time_minutes * 60,
        verifyCommands: stage === "verify" ? this.config.verify.commands : undefined,
      },
      context: {
        summary: overrides.summary ?? `${stage} for issue #${workItem.externalId}`,
        issueBody: overrides.issueBody ?? workItem.title,
        comments: overrides.comments,
        changedFilesHint: overrides.changedFilesHint,
        skills: resolveSkills(this.config, stage, overrides.changedFilesHint),
        extraInstructions: extraInstructions.length > 0 ? extraInstructions : undefined,
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
        statusReason: result.error?.message,
      });
    }

    const gatedWorkflow = this.enforceReviewPolicy(workflow, stage, metadata.workspacePath);
    if (gatedWorkflow) {
      return gatedWorkflow;
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
    const markerPath = join(workspacePath, ".devagent-changed-files.json");
    if (existsSync(markerPath)) {
      const raw = readFileSync(markerPath, "utf-8");
      return [...new Set((JSON.parse(raw) as string[]).filter(Boolean))];
    }

    const candidates: Array<{ cwd: string; args: string[] }> = [
      {
        cwd: workspacePath,
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

  private readPatchBytes(workflow: WorkflowInstance, workspacePath: string): number {
    const markerPath = join(workspacePath, ".devagent-patch-bytes.txt");
    if (existsSync(markerPath)) {
      const raw = Number.parseInt(readFileSync(markerPath, "utf-8").trim(), 10);
      return Number.isFinite(raw) ? raw : 0;
    }

    const candidates: Array<{ cwd: string; args: string[] }> = [
      {
        cwd: workspacePath,
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
