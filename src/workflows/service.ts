import { randomUUID } from "node:crypto";
import type { GitHubGateway } from "../github/gateway.js";
import type { GitHubIssue } from "../github/types.js";
import type { WorkflowConfig } from "../workflow/config.js";
import { resolveSkills } from "../workflow/skill-resolver.js";
import { CanonicalStore } from "../persistence/canonical-store.js";
import { LocalRunnerClient } from "../runner-client/local-runner-client.js";
import type { Project, WorkItem, WorkflowInstance } from "../canonical/types.js";
import type { ExecutorSpec, TaskExecutionRequest, WorkflowTaskType } from "@devagent-sdk/types";
import { PROTOCOL_VERSION } from "@devagent-sdk/types";

function now(): string {
  return new Date().toISOString();
}

function issueId(projectId: string, issue: GitHubIssue): string {
  return `${projectId}:issue:${issue.number}`;
}

function mapExecutorId(bin?: string): ExecutorSpec["executorId"] {
  if (bin?.includes("codex")) return "codex";
  if (bin?.includes("claude")) return "claude";
  if (bin?.includes("opencode")) return "opencode";
  return "devagent";
}

export class WorkflowService {
  constructor(
    private readonly store: CanonicalStore,
    private readonly github: GitHubGateway,
    private readonly runnerClient: LocalRunnerClient,
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
    let workflow = this.store.createWorkflowInstance({
      projectId: this.project.id,
      workItemId: workItem.id,
      stage: "triage",
      status: "running",
      branch,
    });

    await this.runStage(workflow, workItem, "triage");
    workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "plan", status: "running" });
    await this.runStage(workflow, workItem, "plan");
    this.store.createApproval({ workflowInstanceId: workflow.id, stage: "plan" });
    workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "plan", status: "waiting_approval" });
    return workflow;
  }

  async resume(workflowId: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    const pending = this.store.getPendingApproval(workflowId);
    const workItem = this.getWorkItem(workflow.workItemId);

    if (!pending || pending.stage !== "plan") {
      throw new Error("Workflow is not waiting on plan approval");
    }

    this.store.updateApproval(pending.id, "approved", "Approved via run resume");
    workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "implement", status: "running" });
    await this.runStage(workflow, workItem, "implement");
    workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "verify", status: "running" });
    await this.runStage(workflow, workItem, "verify");
    workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "review", status: "running" });
    await this.runStage(workflow, workItem, "review");
    this.store.createApproval({ workflowInstanceId: workflow.id, stage: "review" });
    workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "review", status: "waiting_approval" });
    return workflow;
  }

  async openPr(workflowId: string): Promise<WorkflowInstance> {
    let workflow = this.store.getWorkflowInstance(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    const pending = this.store.getPendingApproval(workflowId);
    if (!pending || pending.stage !== "review") {
      throw new Error("Workflow is not waiting on final approval");
    }
    this.store.updateApproval(pending.id, "approved", "Approved via pr open");
    const workItem = this.getWorkItem(workflow.workItemId);
    const tasks = this.store.listTasks(workflow.id);
    const latestTask = tasks[tasks.length - 1];
    if (!latestTask) throw new Error("No task attempts found");
    const attempts = this.store.listAttempts(latestTask.id);
    const latestAttempt = attempts[attempts.length - 1];
    if (!latestAttempt?.workspacePath) throw new Error("No workspace available for PR handoff");
    const branch = this.store.getWorkflowBranch(workflow.id);

    await this.github.pushBranch(latestAttempt.workspacePath, branch);

    const pr = await this.github.createPR(this.project.repoFullName, {
      title: workItem.title,
      body: `Closes #${workItem.externalId}`,
      head: branch,
      base: "main",
      draft: this.config.pr.draft,
    });
    workflow = this.store.updateWorkflowInstance(workflow.id, { stage: "done", status: "completed" });
    await this.runnerClient.cleanupRun(latestAttempt.runnerId);
    return workflow;
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
    const workItem = this.store.listWorkItems(this.project.id).find((item) => item.id === id);
    if (!workItem) throw new Error(`Work item ${id} not found`);
    return workItem;
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

  private async runStage(workflow: WorkflowInstance, workItem: WorkItem, stage: WorkflowTaskType): Promise<void> {
    const task = this.store.createTask({
      workflowInstanceId: workflow.id,
      type: stage,
      status: "running",
      executorId: this.resolveExecutor(stage).executorId,
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
        baseRef: "main",
        workBranch: this.store.getWorkflowBranch(workflow.id),
        isolation: stage === "verify" || stage === "review" ? "git-worktree" : "git-worktree",
        readOnly: stage === "review",
      },
      executor: this.resolveExecutor(stage),
      constraints: {
        maxIterations: this.config.runner.max_iterations,
        verifyCommands: stage === "verify" ? this.config.verify.commands : undefined,
      },
      context: {
        summary: `${stage} for issue #${workItem.externalId}`,
        issueBody: workItem.title,
        skills: resolveSkills(this.config, stage),
      },
      expectedArtifacts: [
        stage === "triage" ? "triage-report" :
        stage === "plan" ? "plan" :
        stage === "implement" ? "implementation-summary" :
        stage === "verify" ? "verification-report" :
        stage === "review" ? "review-report" :
        "final-summary",
      ],
    };

    const { runId } = await this.runnerClient.startTask(request);
    const attempt = this.store.createAttempt({
      taskId: task.id,
      executorId: request.executor.executorId,
      runnerId: runId,
    });
    this.store.updateTask(task.id, { attemptIds: [...task.attemptIds, attempt.id] });
    await this.runnerClient.subscribe(runId, (event) => this.store.recordEvent(task.id, event));
    const result = await this.runnerClient.awaitResult(runId);
    const metadata = await this.runnerClient.inspect(runId);
    this.store.finishAttempt(attempt.id, {
      status: result.status === "success" ? "success" : result.status === "cancelled" ? "cancelled" : "failed",
      resultPath: metadata.resultPath,
      workspacePath: metadata.workspacePath,
    });
    this.store.recordArtifacts(task.id, result.artifacts);
    this.store.updateTask(task.id, {
      status: result.status === "success" ? "completed" : result.status === "cancelled" ? "cancelled" : "failed",
    });
    if (result.status !== "success") {
      this.store.updateWorkflowInstance(workflow.id, { stage, status: result.status === "cancelled" ? "cancelled" : "failed" });
      throw new Error(`Stage ${stage} failed`);
    }
  }
}
