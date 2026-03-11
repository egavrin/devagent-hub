import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { CanonicalStore } from "../persistence/canonical-store.js";
import { defaultConfig } from "../workflow/config.js";
import { WorkflowService } from "../workflows/service.js";
import { WorkflowStateError } from "../workflows/errors.js";
import type { GitHubGateway } from "../github/gateway.js";
import type { GitHubCheck, GitHubComment, GitHubIssue, GitHubPR } from "../github/types.js";
import type { RunnerClient } from "../runner-client/types.js";
import type { Project } from "../canonical/types.js";
import { PROTOCOL_VERSION, type ArtifactRef, type TaskExecutionEvent, type TaskExecutionRequest, type TaskExecutionResult } from "@devagent-sdk/types";

const paths: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  paths.push(dir);
  return dir;
}

function git(repoRoot: string, args: string[]): void {
  execFileSync("git", args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Codex",
      GIT_AUTHOR_EMAIL: "codex@example.com",
      GIT_COMMITTER_NAME: "Codex",
      GIT_COMMITTER_EMAIL: "codex@example.com",
    },
    stdio: "ignore",
  });
}

async function initializeRepo(repoRoot: string): Promise<void> {
  await writeFile(join(repoRoot, "README.md"), "# repo\n");
  git(repoRoot, ["init", "--initial-branch=main"]);
  git(repoRoot, ["add", "README.md"]);
  git(repoRoot, ["commit", "-m", "test: seed repo"]);
}

async function writeSkill(repoRoot: string, name: string): Promise<void> {
  const skillDir = join(repoRoot, ".agents", "skills", name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: ${name} helper`,
      "---",
      "",
      `# ${name}`,
    ].join("\n"),
  );
}

afterEach(async () => {
  await Promise.all(paths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

class StubGitHubGateway implements GitHubGateway {
  public readonly pushedBranches: Array<{ repoPath: string; branch: string }> = [];
  public readonly createdPrs: Array<{ repo: string; head: string }> = [];
  public readonly resolvedThreads: Array<{ repo: string; prNumber: number; nodeIds: string[] }> = [];
  public reviewComments: GitHubComment[] = [];
  public ciFailureLogs: Array<{ check: string; log: string }> = [];
  public prHead = "devagent/workflow/test-branch";
  public pushFailuresRemaining = 0;

  constructor(private readonly issue: GitHubIssue) {}

  async fetchIssue(): Promise<GitHubIssue> {
    return this.issue;
  }

  async fetchEligibleIssues(): Promise<GitHubIssue[]> {
    return [this.issue];
  }

  async addComment(): Promise<void> {}
  async addLabels(): Promise<void> {}
  async removeLabels(): Promise<void> {}

  async createPR(repo: string, params: { head: string }): Promise<GitHubPR> {
    this.createdPrs.push({ repo, head: params.head });
    this.prHead = params.head;
    return {
      number: 10,
      title: "PR",
      body: "",
      url: "https://github.com/org/repo/pull/10",
      state: "open",
      draft: true,
      head: params.head,
      base: "main",
      checks: [],
      reviewComments: [],
    };
  }

  async fetchPR(_repo: string, _prNumber: number): Promise<GitHubPR> {
    return {
      number: 10,
      title: "PR",
      body: "",
      url: "https://github.com/org/repo/pull/10",
      state: "open",
      draft: true,
      head: this.prHead,
      base: "main",
      checks: [],
      reviewComments: this.reviewComments,
    };
  }

  async fetchPRChecks(): Promise<GitHubCheck[]> {
    return [];
  }

  async fetchPRReviewComments(): Promise<GitHubComment[]> {
    return this.reviewComments;
  }

  async pushBranch(repoPath: string, branch: string): Promise<void> {
    if (this.pushFailuresRemaining > 0) {
      this.pushFailuresRemaining -= 1;
      throw new Error("simulated push failure");
    }
    this.pushedBranches.push({ repoPath, branch });
  }

  async resolveReviewThreads(repo: string, prNumber: number, commentNodeIds: string[]): Promise<void> {
    this.resolvedThreads.push({ repo, prNumber, nodeIds: commentNodeIds });
  }

  async checkBranchConflicts(): Promise<{ conflicted: boolean; conflictFiles: string[] }> {
    return { conflicted: false, conflictFiles: [] };
  }

  async markPRReady(): Promise<void> {}

  async fetchCIFailureLogs(): Promise<{ check: string; log: string }[]> {
    return this.ciFailureLogs;
  }

  async createIssue(): Promise<{ number: number; url: string }> {
    return { number: 11, url: "https://github.com/org/repo/issues/11" };
  }
}

class StubRunnerClient implements RunnerClient {
  private readonly requests = new Map<string, TaskExecutionRequest>();
  private readonly events = new Map<string, TaskExecutionEvent[]>();
  private readonly workspaces = new Map<string, string>();
  private readonly results = new Map<string, TaskExecutionResult>();
  public readonly cancelledRuns: string[] = [];
  public readonly cleanedRuns: string[] = [];
  public readonly startedRequests: TaskExecutionRequest[] = [];
  private readonly failureByTaskType: Partial<Record<TaskExecutionRequest["taskType"], { code: string; message: string }>>;

  constructor(
    private readonly repoRoot: string,
    private readonly reviewSequence: string[],
    private readonly changedFilesByTaskType: Partial<Record<TaskExecutionRequest["taskType"], string[]>> = {},
    private readonly patchBytesByTaskType: Partial<Record<TaskExecutionRequest["taskType"], number>> = {},
    failureByTaskType: Partial<Record<TaskExecutionRequest["taskType"], { code: string; message: string }>> = {},
  ) {
    this.failureByTaskType = failureByTaskType;
  }

  async startTask(request: TaskExecutionRequest): Promise<{ runId: string }> {
    const runId = `${request.taskType}-${request.taskId}`;
    git(this.repoRoot, ["branch", "-f", request.workspace.workBranch, "main"]);
    this.requests.set(runId, request);
    this.startedRequests.push(request);
    return { runId };
  }

  async subscribe(runId: string, onEvent: (event: TaskExecutionEvent) => void): Promise<void> {
    const request = this.requireRequest(runId);
    const failure = this.failureByTaskType[request.taskType];
    const started: TaskExecutionEvent = {
      protocolVersion: PROTOCOL_VERSION,
      type: "started",
      at: "2026-03-10T00:00:00.000Z",
      taskId: request.taskId,
    };
    const completed: TaskExecutionEvent = {
      protocolVersion: PROTOCOL_VERSION,
      type: "completed",
      at: "2026-03-10T00:00:01.000Z",
      taskId: request.taskId,
      status: failure ? "failed" : "success",
    };
    this.events.set(runId, [started, completed]);
    onEvent(started);
    onEvent(completed);
  }

  async cancel(runId: string): Promise<void> {
    this.cancelledRuns.push(runId);
  }

  async awaitResult(runId: string): Promise<TaskExecutionResult> {
    const request = this.requireRequest(runId);
    const workspacePath = await this.ensureWorkspace(runId);
    const artifact = await this.writeArtifact(workspacePath, request);
    const failure = this.failureByTaskType[request.taskType];
    const result: TaskExecutionResult = {
      protocolVersion: PROTOCOL_VERSION,
      taskId: request.taskId,
      status: failure ? "failed" : "success",
      artifacts: [artifact],
      metrics: {
        startedAt: "2026-03-10T00:00:00.000Z",
        finishedAt: "2026-03-10T00:00:01.000Z",
        durationMs: 1000,
      },
      error: failure,
    };
    await writeFile(join(workspacePath, "result.json"), JSON.stringify(result, null, 2));
    this.results.set(runId, result);
    return result;
  }

  async inspect(runId: string): Promise<{ workspacePath: string; resultPath: string }> {
    const workspacePath = await this.ensureWorkspace(runId);
    return {
      workspacePath,
      resultPath: join(workspacePath, "result.json"),
    };
  }

  async cleanupRun(runId: string): Promise<void> {
    this.cleanedRuns.push(runId);
  }

  private requireRequest(runId: string): TaskExecutionRequest {
    const request = this.requests.get(runId);
    if (!request) {
      throw new Error(`Missing request for ${runId}`);
    }
    return request;
  }

  private async ensureWorkspace(runId: string): Promise<string> {
    const existing = this.workspaces.get(runId);
    if (existing) {
      return existing;
    }
    const workspacePath = await createTempDir(`devagent-hub-run-${runId}-`);
    this.workspaces.set(runId, workspacePath);
    return workspacePath;
  }

  private async writeArtifact(workspacePath: string, request: TaskExecutionRequest): Promise<ArtifactRef> {
    await mkdir(workspacePath, { recursive: true });
    const changedFiles = this.changedFilesByTaskType[request.taskType];
    if (changedFiles) {
      await writeFile(
        join(workspacePath, ".devagent-changed-files.json"),
        JSON.stringify(changedFiles, null, 2),
      );
    }
    const patchBytes = this.patchBytesByTaskType[request.taskType];
    if (patchBytes !== undefined) {
      await writeFile(join(workspacePath, ".devagent-patch-bytes.txt"), `${patchBytes}\n`);
    }
    const current = (() => {
      switch (request.taskType) {
        case "triage":
          return { fileName: "triage-report.md", kind: "triage-report", body: "Issue understanding\nSuggested next step" } as const;
        case "plan":
          return { fileName: "plan.md", kind: "plan", body: "Implementation steps\nTest strategy" } as const;
        case "implement":
          return { fileName: "implementation-summary.md", kind: "implementation-summary", body: "Changed files\nSummary of edits" } as const;
        case "verify":
          return { fileName: "verification-report.md", kind: "verification-report", body: "Commands run\nOverall result: pass" } as const;
        case "review":
          return {
            fileName: "review-report.md",
            kind: "review-report",
            body: this.reviewSequence.shift() ?? "No defects found.",
          } as const;
        case "repair":
          return { fileName: "final-summary.md", kind: "final-summary", body: "Fixes applied\nRemaining concerns: none" } as const;
      }
    })();
    const artifactPath = join(workspacePath, current.fileName);
    await writeFile(artifactPath, current.body);
    return {
      kind: current.kind,
      path: artifactPath,
      createdAt: "2026-03-10T00:00:01.000Z",
      mimeType: "text/markdown",
    };
  }
}

class BlockingCancelRunnerClient implements RunnerClient {
  private readonly requests = new Map<string, TaskExecutionRequest>();
  private readonly deferred = new Map<string, { resolve: (result: TaskExecutionResult) => void; result: Promise<TaskExecutionResult> }>();
  public readonly cancelledRuns: string[] = [];
  public readonly cleanedRuns: string[] = [];
  private workspacePath: string | null = null;

  constructor(private readonly repoRoot: string) {}

  async startTask(request: TaskExecutionRequest): Promise<{ runId: string }> {
    const runId = `${request.taskType}-${request.taskId}`;
    git(this.repoRoot, ["branch", "-f", request.workspace.workBranch, "main"]);
    this.requests.set(runId, request);
    let resolveResult!: (result: TaskExecutionResult) => void;
    const result = new Promise<TaskExecutionResult>((resolve) => {
      resolveResult = resolve;
    });
    this.deferred.set(runId, { resolve: resolveResult, result });
    return { runId };
  }

  async subscribe(runId: string, onEvent: (event: TaskExecutionEvent) => void): Promise<void> {
    const request = this.requireRequest(runId);
    onEvent({
      protocolVersion: PROTOCOL_VERSION,
      type: "started",
      at: "2026-03-10T00:00:00.000Z",
      taskId: request.taskId,
    });
  }

  async cancel(runId: string): Promise<void> {
    this.cancelledRuns.push(runId);
    const request = this.requireRequest(runId);
    const workspacePath = await this.ensureWorkspace();
    const artifactPath = join(workspacePath, "triage-report.md");
    await writeFile(artifactPath, "Cancelled during triage");
    const result: TaskExecutionResult = {
      protocolVersion: PROTOCOL_VERSION,
      taskId: request.taskId,
      status: "cancelled",
      artifacts: [{
        kind: "triage-report",
        path: artifactPath,
        createdAt: "2026-03-10T00:00:01.000Z",
        mimeType: "text/markdown",
      }],
      metrics: {
        startedAt: "2026-03-10T00:00:00.000Z",
        finishedAt: "2026-03-10T00:00:01.000Z",
        durationMs: 1000,
      },
      error: {
        code: "CANCELLED",
        message: "Cancelled by operator",
      },
    };
    await writeFile(join(workspacePath, "result.json"), JSON.stringify(result, null, 2));
    this.deferred.get(runId)?.resolve(result);
  }

  async awaitResult(runId: string): Promise<TaskExecutionResult> {
    return this.deferred.get(runId)?.result ?? Promise.reject(new Error(`Missing result for ${runId}`));
  }

  async inspect(_runId: string): Promise<{ workspacePath: string; resultPath: string }> {
    const workspacePath = await this.ensureWorkspace();
    return {
      workspacePath,
      resultPath: join(workspacePath, "result.json"),
    };
  }

  async cleanupRun(runId: string): Promise<void> {
    this.cleanedRuns.push(runId);
  }

  private requireRequest(runId: string): TaskExecutionRequest {
    const request = this.requests.get(runId);
    if (!request) {
      throw new Error(`Missing request for ${runId}`);
    }
    return request;
  }

  private async ensureWorkspace(): Promise<string> {
    if (this.workspacePath) {
      return this.workspacePath;
    }
    this.workspacePath = await createTempDir(`devagent-hub-cancel-`);
    await mkdir(this.workspacePath, { recursive: true });
    await writeFile(join(this.workspacePath, "README.md"), "cancel test");
    return this.workspacePath;
  }
}

async function createService(
  reviewSequence: string[] = ["No defects found."],
  options: {
    changedFilesByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], string[]>>;
    patchBytesByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], number>>;
    failureByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], { code: string; message: string }>>;
    githubPushFailures?: number;
  } = {},
) {
  const root = await createTempDir("devagent-hub-service-");
  const dbPath = join(root, "state.db");
  const repoRoot = join(root, "repo");
  await mkdir(repoRoot, { recursive: true });
  await initializeRepo(repoRoot);
  const store = new CanonicalStore(dbPath);
  const project = store.upsertProject({
    id: "org/repo",
    name: "repo",
    repoRoot,
    repoFullName: "org/repo",
    workflowConfigPath: join(repoRoot, "WORKFLOW.md"),
    allowedExecutors: ["devagent"],
  });
  const issue: GitHubIssue = {
    number: 42,
    title: "Fix canonical workflow",
    body: "Make the hub canonical.",
    labels: ["devagent"],
    url: "https://github.com/org/repo/issues/42",
    state: "open",
    author: "eg",
    createdAt: "2026-03-10T00:00:00.000Z",
    comments: [],
  };
  const github = new StubGitHubGateway(issue);
  github.pushFailuresRemaining = options.githubPushFailures ?? 0;
  const runner = new StubRunnerClient(
    repoRoot,
    [...reviewSequence],
    options.changedFilesByTaskType,
    options.patchBytesByTaskType,
    options.failureByTaskType,
  );
  const config = defaultConfig();
  config.runner.bin = "devagent";
  config.runner.provider = "chatgpt";
  config.runner.model = "gpt-5.4";
  config.repair.max_rounds = 2;
  config.skills.path_overrides = {
    ...config.skills.path_overrides,
    "src/workflows/**": ["state-machine"],
  };
  await writeSkill(repoRoot, "testing");
  await writeSkill(repoRoot, "security-checklist");
  await writeSkill(repoRoot, "state-machine");

  return {
    store,
    dbPath,
    project,
    issue,
    config,
    github,
    repoRoot,
    runner,
    service: new WorkflowService(store, github, runner, project, config),
  };
}

function reopenService(input: {
  dbPath: string;
  project: Project;
  issue: GitHubIssue;
  config: ReturnType<typeof defaultConfig>;
  repoRoot: string;
  reviewSequence?: string[];
  changedFilesByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], string[]>>;
  patchBytesByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], number>>;
  failureByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], { code: string; message: string }>>;
}) {
  const store = new CanonicalStore(input.dbPath);
  const github = new StubGitHubGateway(input.issue);
  const runner = new StubRunnerClient(
    input.repoRoot,
    [...(input.reviewSequence ?? ["No defects found."])],
    input.changedFilesByTaskType,
    input.patchBytesByTaskType,
    input.failureByTaskType,
  );
  return {
    store,
    github,
    runner,
    service: new WorkflowService(store, github, runner, input.project, input.config),
  };
}

describe("WorkflowService", () => {
  it("imports issues and pauses after plan approval", async () => {
    const { store, service } = await createService();

    const items = await service.syncIssues();
    expect(items).toHaveLength(1);

    const workflow = await service.start("42");
    const snapshot = service.getSnapshot(workflow.id);
    expect(snapshot.workflow.status).toBe("waiting_approval");
    expect(snapshot.workflow.stage).toBe("plan");
    expect(snapshot.tasks.map((task) => task.type)).toEqual(["triage", "plan"]);
    expect(snapshot.approvals).toHaveLength(1);
    expect(snapshot.events.length).toBeGreaterThan(0);

    store.close();
  });

  it("builds a human-readable status view for plan review", async () => {
    const { store, service } = await createService();
    const workflow = await service.start("42");
    const status = service.getStatusView(workflow.id);

    expect(status.stage).toBe("plan");
    expect(status.status).toBe("waiting_approval");
    expect(status.approvalPending).toBe(true);
    expect(status.approvalStage).toBe("plan");
    expect(status.artifacts.plan).toContain("plan.md");
    expect(status.nextAction).toContain(`devagent-hub run resume ${workflow.id}`);
    expect(status.nextAction).toContain(`devagent-hub run reject ${workflow.id} --note`);

    store.close();
  });

  it("resumes cleanly after restart when paused on plan approval", async () => {
    const setup = await createService();
    const started = await setup.service.start("42");
    setup.store.close();

    const reopened = reopenService({
      dbPath: setup.dbPath,
      project: setup.project,
      issue: setup.issue,
      config: setup.config,
      repoRoot: setup.repoRoot,
    });

    const status = reopened.service.getStatusView(started.id);
    expect(status.status).toBe("waiting_approval");
    expect(status.stage).toBe("plan");

    const resumed = await reopened.service.resume(started.id);
    expect(resumed.status).toBe("waiting_approval");
    expect(resumed.stage).toBe("review");

    reopened.store.close();
  });

  it("resumes through implement, verify, review and pauses before PR", async () => {
    const { store, service, runner } = await createService();
    const started = await service.start("42");
    const resumed = await service.resume(started.id);

    expect(resumed.status).toBe("waiting_approval");
    expect(resumed.stage).toBe("review");
    const snapshot = service.getSnapshot(started.id);
    expect(snapshot.tasks.map((task) => task.type)).toEqual(["triage", "plan", "implement", "verify", "review"]);
    expect(snapshot.approvals.at(-1)?.stage).toBe("review");
    const implementRequest = runner.startedRequests.find((request) => request.taskType === "implement");
    expect(implementRequest?.context.extraInstructions?.join("\n")).toContain("Accepted plan:");
    expect(implementRequest?.context.extraInstructions?.join("\n")).toContain("Implementation steps");

    store.close();
  });

  it("pauses for manual approval when implement changes exceed the review file threshold", async () => {
    const { store, service } = await createService(["No defects found."], {
      changedFilesByTaskType: {
        implement: Array.from({ length: 21 }, (_, index) => `src/file-${index}.ts`),
      },
    });
    const started = await service.start("42");
    const gated = await service.resume(started.id);

    expect(gated.status).toBe("waiting_approval");
    expect(gated.stage).toBe("implement");
    expect(gated.statusReason).toContain("review.max_changed_files");

    const resumed = await service.resume(started.id);
    expect(resumed.status).toBe("waiting_approval");
    expect(resumed.stage).toBe("review");

    store.close();
  }, 15_000);

  it("fails when implement changes exceed the run-level review limit", async () => {
    const { store, service } = await createService(["No defects found."], {
      changedFilesByTaskType: {
        implement: Array.from({ length: 31 }, (_, index) => `src/file-${index}.ts`),
      },
    });
    const started = await service.start("42");
    const failed = await service.resume(started.id);

    expect(failed.status).toBe("failed");
    expect(failed.stage).toBe("implement");
    expect(failed.statusReason).toContain("review.run_max_changed_files");

    store.close();
  });

  it("resumes cleanly after restart when implement is paused for oversize review", async () => {
    const setup = await createService(["No defects found."], {
      changedFilesByTaskType: {
        implement: Array.from({ length: 21 }, (_, index) => `src/file-${index}.ts`),
      },
    });
    const started = await setup.service.start("42");
    const gated = await setup.service.resume(started.id);
    expect(gated.status).toBe("waiting_approval");
    expect(gated.stage).toBe("implement");
    setup.store.close();

    const reopened = reopenService({
      dbPath: setup.dbPath,
      project: setup.project,
      issue: setup.issue,
      config: setup.config,
      repoRoot: setup.repoRoot,
      changedFilesByTaskType: {
        implement: Array.from({ length: 21 }, (_, index) => `src/file-${index}.ts`),
      },
    });

    const status = reopened.service.getStatusView(started.id);
    expect(status.status).toBe("waiting_approval");
    expect(status.stage).toBe("implement");
    expect(status.statusReason).toContain("review.max_changed_files");

    const resumed = await reopened.service.resume(started.id);
    expect(resumed.status).toBe("waiting_approval");
    expect(resumed.stage).toBe("review");

    reopened.store.close();
  }, 15_000);

  it("pauses for manual approval when implement patch size exceeds the review threshold", async () => {
    const { store, service } = await createService(["No defects found."], {
      changedFilesByTaskType: {
        implement: ["README.md"],
      },
      patchBytesByTaskType: {
        implement: 30_001,
      },
    });
    const started = await service.start("42");
    const gated = await service.resume(started.id);

    expect(gated.status).toBe("waiting_approval");
    expect(gated.stage).toBe("implement");
    expect(gated.statusReason).toContain("review.max_patch_bytes");

    store.close();
  });

  it("fails when implement patch size exceeds the run-level review threshold", async () => {
    const { store, service } = await createService(["No defects found."], {
      changedFilesByTaskType: {
        implement: ["README.md"],
      },
      patchBytesByTaskType: {
        implement: 60_001,
      },
    });
    const started = await service.start("42");
    const failed = await service.resume(started.id);

    expect(failed.status).toBe("failed");
    expect(failed.stage).toBe("implement");
    expect(failed.statusReason).toContain("review.run_max_patch_bytes");

    store.close();
  });

  it("reruns plan when a human rejects the plan approval", async () => {
    const { store, service, runner } = await createService();
    const started = await service.start("42");
    const rejected = await service.reject(started.id, "Expand the rollback plan and call out touched files.");
    const snapshot = service.getSnapshot(rejected.id);

    expect(rejected.status).toBe("waiting_approval");
    expect(rejected.stage).toBe("plan");
    expect(snapshot.tasks.map((task) => task.type)).toEqual(["triage", "plan", "plan"]);
    expect(snapshot.approvals.map((approval) => approval.status)).toEqual(["rejected", "pending"]);
    expect(runner.startedRequests.at(-1)?.context.extraInstructions?.join("\n")).toContain("Expand the rollback plan");

    store.close();
  });

  it("fails resume when the stored baseline snapshot no longer matches the current pinned baseline", async () => {
    const { store, service } = await createService();
    const started = await service.start("42");
    const stale = store.updateWorkflowInstance(started.id, {
      baselineSnapshot: {
        ...started.baselineSnapshot,
        system: {
          ...started.baselineSnapshot.system,
          devagentSha: "stale-devagent-sha",
        },
      },
    });

    await expect(service.resume(stale.id)).rejects.toMatchObject({
      code: "STALE_BASELINE",
      name: "WorkflowStateError",
    } satisfies Partial<WorkflowStateError>);

    store.close();
  });

  it("fails resume when the recorded base branch SHA has drifted", async () => {
    const { store, service } = await createService();
    const started = await service.start("42");
    const stale = store.updateWorkflowInstance(started.id, {
      baseSha: "deadbeef",
    });

    await expect(service.resume(stale.id)).rejects.toMatchObject({
      code: "STALE_BRANCH_REF",
      name: "WorkflowStateError",
    } satisfies Partial<WorkflowStateError>);

    store.close();
  });

  it("shows the persisted failed verify state after restart", async () => {
    const setup = await createService(["No defects found."], {
      failureByTaskType: {
        verify: {
          code: "EXECUTION_FAILED",
          message: "verify failed",
        },
      },
    });
    const started = await setup.service.start("42");
    const failed = await setup.service.resume(started.id);
    expect(failed.status).toBe("failed");
    expect(failed.stage).toBe("verify");
    setup.store.close();

    const reopened = reopenService({
      dbPath: setup.dbPath,
      project: setup.project,
      issue: setup.issue,
      config: setup.config,
      repoRoot: setup.repoRoot,
      failureByTaskType: {
        verify: {
          code: "EXECUTION_FAILED",
          message: "verify failed",
        },
      },
    });

    const status = reopened.service.getStatusView(started.id);
    expect(status.status).toBe("failed");
    expect(status.stage).toBe("verify");
    expect(status.latestResult?.status).toBe("failed");
    expect(status.latestResult?.error?.message).toBe("verify failed");

    reopened.store.close();
  });

  it("runs the repair loop when review artifacts contain blocking findings", async () => {
    const { store, service } = await createService([
      "Severity: high\nFix recommendation: resolve the lint failure.",
      "No defects found.",
    ]);
    const started = await service.start("42");
    const resumed = await service.resume(started.id);
    const snapshot = service.getSnapshot(resumed.id);

    expect(snapshot.workflow.status).toBe("waiting_approval");
    expect(snapshot.workflow.repairRound).toBe(1);
    expect(snapshot.tasks.map((task) => task.type)).toEqual([
      "triage",
      "plan",
      "implement",
      "verify",
      "review",
      "repair",
      "verify",
      "review",
    ]);
    const repairTask = snapshot.tasks.find((task) => task.type === "repair");
    expect(repairTask).toBeTruthy();

    store.close();
  });

  it("pauses for manual approval when repair changes exceed the review file threshold", async () => {
    const { store, service } = await createService([
      "Severity: high\nFix recommendation: resolve the lint failure.",
      "No defects found.",
    ], {
      changedFilesByTaskType: {
        repair: Array.from({ length: 21 }, (_, index) => `src/repair-${index}.ts`),
      },
    });
    const started = await service.start("42");
    const gated = await service.resume(started.id);

    expect(gated.status).toBe("waiting_approval");
    expect(gated.stage).toBe("repair");
    expect(gated.statusReason).toContain("review.max_changed_files");

    const resumed = await service.resume(started.id);
    expect(resumed.status).toBe("waiting_approval");
    expect(resumed.stage).toBe("review");

    store.close();
  }, 15_000);

  it("includes latest review and verification artifacts when the automatic repair loop reruns", async () => {
    const { store, service, runner } = await createService([
      "Severity: high\nFix recommendation: resolve the lint failure.",
      "No defects found.",
    ]);
    const started = await service.start("42");
    await service.resume(started.id);

    const repairRequest = runner.startedRequests.find((request) => request.taskType === "repair");
    expect(repairRequest?.context.extraInstructions?.join("\n")).toContain("Latest review report");
    expect(repairRequest?.context.extraInstructions?.join("\n")).toContain("Severity: high");
    expect(repairRequest?.context.extraInstructions?.join("\n")).toContain("Latest verification report");
    expect(repairRequest?.context.extraInstructions?.join("\n")).toContain("Overall result: pass");

    store.close();
  });

  it("reruns repair, verify, and review when a human rejects final review approval", async () => {
    const { store, service, runner } = await createService([
      "No defects found.",
      "No defects found.",
    ]);
    const started = await service.start("42");
    await service.resume(started.id);
    const rejected = await service.reject(started.id, "Address the missing release note before opening the PR.");
    const snapshot = service.getSnapshot(rejected.id);

    expect(rejected.status).toBe("waiting_approval");
    expect(rejected.stage).toBe("review");
    expect(snapshot.tasks.map((task) => task.type)).toEqual([
      "triage",
      "plan",
      "implement",
      "verify",
      "review",
      "repair",
      "verify",
      "review",
    ]);
    expect(snapshot.approvals.map((approval) => approval.status)).toEqual(["approved", "rejected", "pending"]);
    expect(runner.startedRequests.at(-3)?.taskType).toBe("repair");
    expect(runner.startedRequests.at(-3)?.context.extraInstructions?.join("\n")).toContain("missing release note");

    store.close();
  });

  it("opens a PR after final approval and cleans up the runner", async () => {
    const { store, service, github, runner } = await createService();
    const started = await service.start("42");
    await service.resume(started.id);
    const completed = await service.openPr(started.id);

    expect(completed.status).toBe("completed");
    expect(completed.stage).toBe("done");
    expect(completed.prNumber).toBe(10);
    expect(completed.prUrl).toBe("https://github.com/org/repo/pull/10");
    expect(github.createdPrs).toHaveLength(1);
    expect(github.pushedBranches).toHaveLength(1);
    expect(runner.cleanedRuns).toHaveLength(1);

    const snapshot = service.getSnapshot(started.id);
    expect(snapshot.approvals.every((approval) => approval.status === "approved")).toBe(true);

    const resultFile = snapshot.results.at(-1)?.result.taskId;
    expect(resultFile).toBeTruthy();

    const reviewArtifact = snapshot.artifacts.find((artifact) => artifact.kind === "review-report");
    expect(reviewArtifact).toBeTruthy();
    expect(await readFile(reviewArtifact!.path, "utf-8")).toContain("No defects found");

    store.close();
  }, 15_000);

  it("retries PR open after approval was already persisted", async () => {
    const { store, service, github, runner } = await createService(["No defects found."], {
      githubPushFailures: 1,
    });
    const started = await service.start("42");
    await service.resume(started.id);

    await expect(service.openPr(started.id)).rejects.toThrow("simulated push failure");
    const stuck = service.getSnapshot(started.id);
    expect(stuck.workflow.status).toBe("waiting_approval");
    expect(stuck.workflow.prNumber).toBeUndefined();
    expect(stuck.approvals.at(-1)?.stage).toBe("review");
    expect(stuck.approvals.at(-1)?.status).toBe("approved");

    const reopened = await service.openPr(started.id);

    expect(reopened.status).toBe("completed");
    expect(reopened.stage).toBe("done");
    expect(reopened.prNumber).toBe(10);
    expect(github.createdPrs).toHaveLength(1);
    expect(github.pushedBranches).toHaveLength(1);
    expect(runner.cleanedRuns).toHaveLength(1);

    store.close();
  }, 15_000);

  it("repairs an opened PR from review comments and CI failures", async () => {
    const { store, service, github, repoRoot, runner } = await createService([
      "No defects found.",
      "No defects found.",
    ]);
    await mkdir(join(repoRoot, "src", "workflows"), { recursive: true });
    await writeFile(join(repoRoot, "src", "workflows", "service.ts"), "export const repair = true;\n");
    const started = await service.start("42");
    await service.resume(started.id);
    await service.openPr(started.id);

    github.reviewComments = [{
      id: 1,
      nodeId: "PRRC_kwDOExample",
      author: "reviewer",
      body: "Please remove the debug branch and make the TUI label clearer.",
      createdAt: "2026-03-10T00:00:00.000Z",
      path: "src/tui/app.tsx",
      line: 25,
    }];
    github.ciFailureLogs = [{
      check: "Typecheck, Test, Build",
      log: "src/tui/app.tsx:10:7 - error TS2322: Type 'string' is not assignable to type 'number'.",
    }];

    const repaired = await service.repairPr(started.id);
    const snapshot = service.getSnapshot(started.id);

    expect(repaired.status).toBe("completed");
    expect(repaired.stage).toBe("done");
    expect(snapshot.tasks.map((task) => task.type)).toEqual([
      "triage",
      "plan",
      "implement",
      "verify",
      "review",
      "repair",
      "verify",
      "review",
    ]);
    expect(github.pushedBranches).toHaveLength(2);
    expect(github.resolvedThreads).toHaveLength(1);
    expect(github.resolvedThreads[0]?.nodeIds).toEqual(["PRRC_kwDOExample"]);
    expect(runner.cleanedRuns).toHaveLength(2);
    expect(runner.startedRequests.at(-3)?.taskType).toBe("repair");
    expect(runner.startedRequests.at(-3)?.context.comments?.[0]?.body).toContain("src/tui/app.tsx:25");
    expect(runner.startedRequests.at(-3)?.context.changedFilesHint).toEqual(["src/tui/app.tsx"]);
    expect(runner.startedRequests.at(-3)?.context.extraInstructions?.join("\n")).toContain("Typecheck, Test, Build");
    expect(runner.startedRequests.at(-3)?.context.extraInstructions?.join("\n")).toContain("src/tui/app.tsx:25");

    store.close();
  }, 15_000);

  it("fails PR repair when the PR head no longer matches the workflow branch", async () => {
    const { store, service, github } = await createService([
      "No defects found.",
      "No defects found.",
    ]);
    const started = await service.start("42");
    await service.resume(started.id);
    await service.openPr(started.id);
    github.prHead = "pre-rewrite/legacy-branch";

    await expect(service.repairPr(started.id)).rejects.toMatchObject({
      code: "HISTORICAL_RUN_REQUIRES_MANUAL_INTERVENTION",
      name: "WorkflowStateError",
    } satisfies Partial<WorkflowStateError>);

    store.close();
  });

  it("uses changed file hints for path-scoped skills during PR repair", async () => {
    const { store, service, github, runner } = await createService([
      "No defects found.",
      "No defects found.",
    ]);
    const started = await service.start("42");
    await service.resume(started.id);
    await service.openPr(started.id);

    github.reviewComments = [{
      id: 1,
      nodeId: "PRRC_kwDOPathScoped",
      author: "reviewer",
      body: "Update the workflow service logic here.",
      createdAt: "2026-03-10T00:00:00.000Z",
      path: "src/workflows/service.ts",
      line: 247,
    }];
    github.ciFailureLogs = [{
      check: "Typecheck, Test, Build",
      log: "src/workflows/service.ts:247:5 - fix the repair request context.",
    }];

    await service.repairPr(started.id);

    const repairRequest = runner.startedRequests.at(-3);
    expect(repairRequest?.taskType).toBe("repair");
    expect(repairRequest?.context.changedFilesHint).toEqual(["src/workflows/service.ts"]);
    expect(repairRequest?.context.skills).toContain("state-machine");

    store.close();
  }, 15_000);

  it("cancels an in-flight workflow and cleans up the runner workspace", async () => {
    const root = await createTempDir("devagent-hub-cancel-service-");
    const dbPath = join(root, "state.db");
    const repoRoot = join(root, "repo");
    await mkdir(repoRoot, { recursive: true });
    await initializeRepo(repoRoot);
    const store = new CanonicalStore(dbPath);
    const project = store.upsertProject({
      id: "org/repo",
      name: "repo",
      repoRoot,
      repoFullName: "org/repo",
      workflowConfigPath: join(repoRoot, "WORKFLOW.md"),
      allowedExecutors: ["devagent"],
    });
    const issue: GitHubIssue = {
      number: 42,
      title: "Cancel workflow",
      body: "Validate cancellation.",
      labels: ["devagent"],
      url: "https://github.com/org/repo/issues/42",
      state: "open",
      author: "eg",
      createdAt: "2026-03-10T00:00:00.000Z",
      comments: [],
    };
    const github = new StubGitHubGateway(issue);
    const runner = new BlockingCancelRunnerClient(repoRoot);
    const config = defaultConfig();
    config.runner.bin = "devagent";
    config.runner.provider = "chatgpt";
    config.runner.model = "gpt-5.4";
    const service = new WorkflowService(store, github, runner, project, config);

    const startPromise = service.start("42");
    let workflowId = "";
    for (let index = 0; index < 20; index += 1) {
      workflowId = service.listWorkflows()[0]?.id ?? "";
      if (workflowId) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(workflowId).toBeTruthy();
    const cancelled = await service.cancel(workflowId);
    const terminal = await startPromise;

    expect(cancelled.status).toBe("cancelled");
    expect(terminal.status).toBe("cancelled");
    expect(runner.cancelledRuns).toHaveLength(1);
    expect(runner.cleanedRuns).toHaveLength(1);

    store.close();
  });

  it("does not mark a workflow cancelled once it has already reached an approval pause", async () => {
    const { store, service } = await createService();
    const started = await service.start("42");
    const paused = await service.resume(started.id);

    expect(paused.status).toBe("waiting_approval");
    expect(paused.stage).toBe("review");

    const current = await service.cancel(started.id);

    expect(current.status).toBe("waiting_approval");
    expect(current.stage).toBe("review");
    expect(current.statusReason).toBeUndefined();

    store.close();
  });
});
