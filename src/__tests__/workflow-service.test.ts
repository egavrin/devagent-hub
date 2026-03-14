import { execFileSync } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { CanonicalStore } from "../persistence/canonical-store.js";
import { defaultConfig } from "../workflow/config.js";
import { WorkflowService } from "../workflows/service.js";
import { WorkflowStateError } from "../workflows/errors.js";
import type { GitHubGateway, PushBranchResult } from "../github/gateway.js";
import type { GitHubCheck, GitHubComment, GitHubIssue, GitHubPR } from "../github/types.js";
import type { RunnerClient } from "../runner-client/types.js";
import type { Project } from "../canonical/types.js";
import { PROTOCOL_VERSION, type ArtifactRef, type TaskExecutionEvent, type TaskExecutionRequest, type TaskExecutionResult } from "@devagent-sdk/types";
import type { ResolvedWorkflowConfig } from "../workflow/config.js";

const paths: string[] = [];
process.env.DEVAGENT_HUB_SKIP_BASELINE_CHECKS = "1";

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
  public readonly fetchedPrs: Array<{ repo: string; prNumber: number }> = [];
  public reviewComments: GitHubComment[] = [];
  public ciFailureLogs: Array<{ check: string; log: string }> = [];
  public prHead = "devagent/workflow/test-branch";
  public pushFailuresRemaining = 0;
  public nextPushResult: PushBranchResult = { pushedCommit: true, pushedSha: "abc123" };

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

  async fetchPR(repo: string, prNumber: number): Promise<GitHubPR> {
    this.fetchedPrs.push({ repo, prNumber });
    return {
      number: prNumber,
      title: "PR",
      body: "",
      url: `https://github.com/${repo}/pull/${prNumber}`,
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

  async pushBranch(repoPath: string, branch: string): Promise<PushBranchResult> {
    if (this.pushFailuresRemaining > 0) {
      this.pushFailuresRemaining -= 1;
      throw new Error("simulated push failure");
    }
    this.pushedBranches.push({ repoPath, branch });
    return this.nextPushResult;
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
    protected readonly repoRoot: string,
    private readonly reviewSequence: string[],
    private readonly changedFilesByTaskType: Partial<Record<TaskExecutionRequest["taskType"], string[]>> = {},
    private readonly changedFilesSequenceByTaskType: Partial<Record<TaskExecutionRequest["taskType"], string[][]>> = {},
    private readonly patchBytesByTaskType: Partial<Record<TaskExecutionRequest["taskType"], number>> = {},
    failureByTaskType: Partial<Record<TaskExecutionRequest["taskType"], { code: string; message: string }>> = {},
  ) {
    this.failureByTaskType = failureByTaskType;
  }

  async startTask(request: TaskExecutionRequest): Promise<{ runId: string }> {
    const runId = `${request.taskType}-${request.taskId}`;
    git(this.repoRoot, ["branch", "-f", request.execution.repositories[0]!.workBranch, "main"]);
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
      session: request.taskType === "verify"
        ? undefined
        : {
            kind: "devagent-headless-v1",
            payload: {
              requestTaskId: request.taskId,
              continuationMode: request.continuation?.mode ?? "fresh",
            },
          },
      outcome: failure ? "no_progress" : "completed",
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

  async inspect(runId: string): Promise<{ workspacePath: string; resultPath: string; eventLogPath: string }> {
    const workspacePath = await this.ensureWorkspace(runId);
    return {
      workspacePath,
      resultPath: join(workspacePath, "result.json"),
      eventLogPath: join(workspacePath, "events.jsonl"),
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

  protected async ensureWorkspace(runId: string): Promise<string> {
    const existing = this.workspaces.get(runId);
    if (existing) {
      return existing;
    }
    const workspacePath = await createTempDir(`devagent-hub-run-${runId}-`);
    this.workspaces.set(runId, workspacePath);
    return workspacePath;
  }

  protected async writeArtifact(workspacePath: string, request: TaskExecutionRequest): Promise<ArtifactRef> {
    await mkdir(workspacePath, { recursive: true });
    const queuedChangedFiles = this.changedFilesSequenceByTaskType[request.taskType];
    const changedFiles = queuedChangedFiles?.length
      ? queuedChangedFiles.shift()
      : this.changedFilesByTaskType[request.taskType]
        ?? (request.taskType === "implement"
          ? ["src/implemented.ts"]
          : request.taskType === "repair"
            ? ["src/repaired.ts"]
            : undefined);
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

class SharedWorkspaceContaminationRunnerClient extends StubRunnerClient {
  private sharedWorkspacePath: string | null = null;

  protected override async ensureWorkspace(_runId: string): Promise<string> {
    if (this.sharedWorkspacePath) {
      return this.sharedWorkspacePath;
    }
    this.sharedWorkspacePath = await createTempDir("devagent-hub-shared-run-");
    await mkdir(this.sharedWorkspacePath, { recursive: true });
    return this.sharedWorkspacePath;
  }

  protected override async writeArtifact(workspacePath: string, request: TaskExecutionRequest): Promise<ArtifactRef> {
    const primaryRepository = request.execution.repositories.find((repository) =>
      repository.repositoryId === request.execution.primaryRepositoryId
    );
    if ((request.taskType === "triage" || request.taskType === "plan") && primaryRepository?.readOnly === false) {
      await writeFile(
        join(workspacePath, ".devagent-changed-files.json"),
        JSON.stringify(["README.md"], null, 2),
      );
    }
    return super.writeArtifact(workspacePath, request);
  }
}

class NestedPrimaryRepoRunnerClient extends StubRunnerClient {
  protected override async ensureWorkspace(runId: string): Promise<string> {
    const existing = await super.ensureWorkspace(runId);
    const primaryRepoPath = join(existing, "repos", "primary");
    await mkdir(join(existing, "repos"), { recursive: true });
    if (!await this.pathExists(join(primaryRepoPath, ".git"))) {
      git(existing, ["clone", this.repoRoot, primaryRepoPath]);
    }
    return existing;
  }

  protected override async writeArtifact(workspacePath: string, request: TaskExecutionRequest): Promise<ArtifactRef> {
    const artifact = await super.writeArtifact(workspacePath, request);
    if (request.taskType === "implement") {
      const primaryRepoPath = join(workspacePath, "repos", "primary");
      await writeFile(join(primaryRepoPath, "README.md"), "# repo\nnested change\n");
    }
    return artifact;
  }

  async cleanupRun(runId: string): Promise<void> {
    await super.cleanupRun(runId);
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
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
    git(this.repoRoot, ["branch", "-f", request.execution.repositories[0]!.workBranch, "main"]);
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

  async inspect(_runId: string): Promise<{ workspacePath: string; resultPath: string; eventLogPath: string }> {
    const workspacePath = await this.ensureWorkspace();
    return {
      workspacePath,
      resultPath: join(workspacePath, "result.json"),
      eventLogPath: join(workspacePath, "events.jsonl"),
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
    changedFilesSequenceByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], string[][]>>;
    patchBytesByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], number>>;
    failureByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], { code: string; message: string }>>;
    githubPushFailures?: number;
    configResolution?: ResolvedWorkflowConfig;
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
    options.changedFilesSequenceByTaskType,
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
    service: new WorkflowService(
      store,
      github,
      runner,
      project,
      config,
      options.configResolution,
    ),
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
  changedFilesSequenceByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], string[][]>>;
  patchBytesByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], number>>;
  failureByTaskType?: Partial<Record<TaskExecutionRequest["taskType"], { code: string; message: string }>>;
  configResolution?: ResolvedWorkflowConfig;
}) {
  const store = new CanonicalStore(input.dbPath);
  const github = new StubGitHubGateway(input.issue);
  const runner = new StubRunnerClient(
    input.repoRoot,
    [...(input.reviewSequence ?? ["No defects found."])],
    input.changedFilesByTaskType,
    input.changedFilesSequenceByTaskType,
    input.patchBytesByTaskType,
    input.failureByTaskType,
  );
  return {
    store,
    github,
    runner,
    service: new WorkflowService(store, github, runner, input.project, input.config, input.configResolution),
  };
}

describe("WorkflowService", () => {
  it("imports existing PR reviewables using GitHub metadata by default", async () => {
    const { store, service } = await createService();

    const reviewable = await service.importReviewable({
      workspaceId: "org/repo",
      repositoryId: "org/repo:primary",
      externalId: "10",
    });

    expect(reviewable.title).toBe("PR");
    expect(reviewable.url).toBe("https://github.com/org/repo/pull/10");
    expect(store.getReviewable(reviewable.id)?.externalId).toBe("10");

    store.close();
  });

  it("returns imported reviewables by id", async () => {
    const { store, service } = await createService();
    const reviewable = await service.importReviewable({
      workspaceId: "org/repo",
      repositoryId: "org/repo:primary",
      externalId: "10",
      title: "Imported title override",
      url: "https://github.com/org/repo/pull/10",
    });

    expect(service.getReviewable(reviewable.id)).toEqual(reviewable);

    store.close();
  });

  it("imports reviewables into the requested workspace and repository", async () => {
    const { store, service, github } = await createService();
    const repoRoot = await createTempDir("devagent-hub-secondary-repo-");
    await initializeRepo(repoRoot);
    store.upsertWorkspace({
      id: "workspace-2",
      name: "secondary",
      provider: "github",
      primaryRepositoryId: "workspace-2:secondary",
      allowedExecutors: ["devagent"],
    });
    store.upsertRepository({
      id: "workspace-2:secondary",
      workspaceId: "workspace-2",
      alias: "secondary",
      name: "secondary",
      repoRoot,
      repoFullName: "org/secondary",
      defaultBranch: "main",
      provider: "github",
    });

    const reviewable = await service.importReviewable({
      workspaceId: "workspace-2",
      repositoryId: "workspace-2:secondary",
      externalId: "11",
    });

    expect(github.fetchedPrs).toContainEqual({ repo: "org/secondary", prNumber: 11 });
    expect(reviewable.workspaceId).toBe("workspace-2");
    expect(reviewable.repositoryId).toBe("workspace-2:secondary");
    expect(reviewable.url).toBe("https://github.com/org/secondary/pull/11");
    expect(store.getReviewable(reviewable.id)?.workspaceId).toBe("workspace-2");

    store.close();
  });

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

  it("sends triage and plan as readonly stages with explicit no-edit instructions", async () => {
    const { store, service, runner } = await createService();

    await service.start("42");

    const triageRequest = runner.startedRequests.find((request) => request.taskType === "triage");
    const planRequest = runner.startedRequests.find((request) => request.taskType === "plan");

    expect(triageRequest?.execution.repositories.every((repository) => repository.readOnly)).toBe(true);
    expect(planRequest?.execution.repositories.every((repository) => repository.readOnly)).toBe(true);
    expect(triageRequest?.context.extraInstructions).toContain("Do not modify files.");
    expect(triageRequest?.context.extraInstructions).toContain("Do not run verification commands.");
    expect(planRequest?.context.extraInstructions).toContain("Only inspect current state and produce the requested artifact.");

    store.close();
  });

  it("keeps implement writable for target repositories", async () => {
    const { store, service, runner } = await createService(["No defects found."]);

    const started = await service.start("42");
    await service.resume(started.id);

    const implementRequest = runner.startedRequests.find((request) => request.taskType === "implement");
    const primaryExecutionRepository = implementRequest?.execution.repositories.find((repository) =>
      repository.repositoryId === implementRequest.execution.primaryRepositoryId
    );

    expect(primaryExecutionRepository?.readOnly).toBe(false);

    store.close();
  });

  it("prevents triage and plan from contaminating implement no-progress detection", async () => {
    const repoRoot = await createTempDir("devagent-hub-contamination-repo-");
    await initializeRepo(repoRoot);
    const dbPath = join(await createTempDir("devagent-hub-db-"), "hub.db");
    const issue: GitHubIssue = {
      number: 42,
      title: "Contamination regression",
      body: "Prevent pre-implement mutation.",
      labels: ["devagent"],
      url: "https://github.com/org/repo/issues/42",
      state: "open",
      author: "eg",
      createdAt: "2026-03-10T00:00:00.000Z",
      comments: [],
    };
    const store = new CanonicalStore(dbPath);
    const github = new StubGitHubGateway(issue);
    const project: Project = {
      id: "org/repo",
      name: "repo",
      repoRoot,
      repoFullName: "org/repo",
      workflowConfigPath: join(repoRoot, "WORKFLOW.md"),
      allowedExecutors: ["devagent"],
    };
    store.upsertProject(project);
    store.upsertWorkspace({
      id: project.id,
      name: project.name,
      provider: "github",
      primaryRepositoryId: `${project.id}:primary`,
      workflowConfigPath: project.workflowConfigPath,
      allowedExecutors: project.allowedExecutors,
    });
    store.upsertRepository({
      id: `${project.id}:primary`,
      workspaceId: project.id,
      alias: "primary",
      name: project.name,
      repoRoot: project.repoRoot,
      repoFullName: project.repoFullName,
      defaultBranch: "main",
      provider: "github",
    });
    const config = defaultConfig();
    config.runner.bin = "devagent";
    config.runner.provider = "chatgpt";
    config.runner.model = "gpt-5.4";
    const runner = new SharedWorkspaceContaminationRunnerClient(repoRoot, ["No defects found."], {}, {
      implement: [
        [],
        [],
      ],
    });
    const service = new WorkflowService(store, github, runner, project, config);

    const started = await service.start("42");
    const failed = await service.resume(started.id);
    const triageRequest = runner.startedRequests.find((request) => request.taskType === "triage");
    const planRequest = runner.startedRequests.find((request) => request.taskType === "plan");

    expect(triageRequest?.execution.repositories.every((repository) => repository.readOnly)).toBe(true);
    expect(planRequest?.execution.repositories.every((repository) => repository.readOnly)).toBe(true);
    expect(failed.status).toBe("failed");
    expect(failed.stage).toBe("implement");
    expect(failed.statusReason).toContain("no repository changes after retry");

    store.close();
  });

  it("detects implement changes from a nested primary repo workspace", async () => {
    const root = await createTempDir("devagent-hub-nested-primary-");
    const dbPath = join(root, "state.db");
    const repoRoot = join(root, "repo");
    await mkdir(repoRoot, { recursive: true });
    await initializeRepo(repoRoot);
    const store = new CanonicalStore(dbPath);
    const issue: GitHubIssue = {
      number: 42,
      title: "Nested workspace regression",
      body: "Detect git-worktree changes under repos/primary.",
      labels: ["devagent"],
      url: "https://github.com/org/repo/issues/42",
      state: "open",
      author: "eg",
      createdAt: "2026-03-10T00:00:00.000Z",
      comments: [],
    };
    const github = new StubGitHubGateway(issue);
    const project: Project = {
      id: "org/repo",
      name: "repo",
      repoRoot,
      repoFullName: "org/repo",
      workflowConfigPath: join(repoRoot, "WORKFLOW.md"),
      allowedExecutors: ["devagent"],
    };
    store.upsertProject(project);
    store.upsertWorkspace({
      id: project.id,
      name: project.name,
      provider: "github",
      primaryRepositoryId: `${project.id}:primary`,
      workflowConfigPath: project.workflowConfigPath,
      allowedExecutors: project.allowedExecutors,
    });
    store.upsertRepository({
      id: `${project.id}:primary`,
      workspaceId: project.id,
      alias: "primary",
      name: project.name,
      repoRoot: project.repoRoot,
      repoFullName: project.repoFullName,
      defaultBranch: "main",
      provider: "github",
    });
    const config = defaultConfig();
    config.runner.bin = "devagent";
    config.runner.provider = "chatgpt";
    config.runner.model = "gpt-5.4";
    const runner = new NestedPrimaryRepoRunnerClient(repoRoot, ["No defects found."]);
    const service = new WorkflowService(store, github, runner, project, config);

    const started = await service.start("42");
    const resumed = await service.resume(started.id);

    expect(resumed.status).toBe("waiting_approval");
    expect(resumed.stage).toBe("review");

    store.close();
  });

  it("creates a detached workflow immediately before any tasks run", async () => {
    const { store, service, runner } = await createService();

    const workflow = await service.startDetached("42");
    const snapshot = service.getSnapshot(workflow.id);

    expect(workflow.status).toBe("running");
    expect(workflow.stage).toBe("triage");
    expect(snapshot.tasks).toHaveLength(0);
    expect(snapshot.artifacts).toHaveLength(0);
    expect(snapshot.events).toHaveLength(0);
    expect(runner.startedRequests).toHaveLength(0);

    store.close();
  });

  it("reuses the active workflow when the same local task is started twice", async () => {
    const { store, service } = await createService();
    const task = service.createLocalTask({
      title: "Manual task",
      description: "Operator-created task",
    });

    const first = await service.startForWorkItem(task.id);
    const second = await service.startForWorkItem(task.id);

    expect(second.id).toBe(first.id);
    expect(
      store.listWorkflowInstances().filter((workflow) => workflow.workItemId === task.id),
    ).toHaveLength(1);

    store.close();
  });

  it("continues a detached workflow through plan approval", async () => {
    const { store, service } = await createService();

    const started = await service.startDetached("42");
    const continued = await service.continue(started.id);
    const snapshot = service.getSnapshot(started.id);

    expect(continued.status).toBe("waiting_approval");
    expect(continued.stage).toBe("plan");
    expect(snapshot.tasks.map((task) => task.type)).toEqual(["triage", "plan"]);

    store.close();
  });

  it("records executor selection from profile bin mappings", async () => {
    const { store, service, config, runner } = await createService();
    config.profiles.codex = {
      bin: "/Applications/Codex.app/Contents/Resources/codex",
      model: "gpt-5-codex",
    };
    config.roles.plan = "codex";

    const workflow = await service.start("42");
    const snapshot = service.getSnapshot(workflow.id);
    const planTask = snapshot.tasks.find((task) => task.type === "plan");

    expect(planTask?.executorId).toBe("codex");
    expect(runner.startedRequests.find((request) => request.taskType === "plan")?.executor.profileName).toBe("codex");
    expect(runner.startedRequests.find((request) => request.taskType === "plan")?.executor.executorId).toBe("codex");

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

  it("injects inferred workflow warnings into triage, plan, and implement requests", async () => {
    const inferredConfig = defaultConfig();
    const { store, service, runner } = await createService(["No defects found."], {
      configResolution: {
        config: inferredConfig,
        source: "inferred-python",
        warnings: [
          "WORKFLOW.md is missing; inferred python workflow defaults.",
          "Using inferred verify commands: python -m pytest",
        ],
        inferredVerifyCommands: ["python -m pytest"],
        detectedProjectKind: "python",
      },
    });

    const started = await service.start("42");
    await service.resume(started.id);

    const triageRequest = runner.startedRequests.find((request) => request.taskType === "triage");
    const planRequest = runner.startedRequests.find((request) => request.taskType === "plan");
    const implementRequest = runner.startedRequests.find((request) => request.taskType === "implement");

    expect(triageRequest?.context.extraInstructions?.join("\n")).toContain("inferred python workflow defaults");
    expect(planRequest?.context.extraInstructions?.join("\n")).toContain("python -m pytest");
    expect(implementRequest?.context.extraInstructions?.join("\n")).toContain("Detected project kind: python");

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

  it("retries implement once when the first attempt produces no repository changes", async () => {
    const { store, service, runner } = await createService(["No defects found."], {
      changedFilesSequenceByTaskType: {
        implement: [
          [],
          ["src/fixed.ts"],
        ],
      },
    });
    const started = await service.start("42");
    const resumed = await service.resume(started.id);
    const snapshot = service.getSnapshot(started.id);
    const implementTask = snapshot.tasks.find((task) => task.type === "implement");

    expect(resumed.status).toBe("waiting_approval");
    expect(resumed.stage).toBe("review");
    expect(implementTask?.attemptIds).toHaveLength(2);
    expect(runner.startedRequests.filter((request) => request.taskType === "implement")).toHaveLength(2);
    expect(runner.startedRequests.filter((request) => request.taskType === "implement")[1]?.continuation?.mode).toBe("resume");
    expect(service.getLatestContinuationSession(started.id, ["implement"])?.kind).toBe("devagent-headless-v1");

    store.close();
  });

  it("fails implement when retry still produces no repository changes", async () => {
    const { store, service, runner } = await createService(["No defects found."], {
      changedFilesSequenceByTaskType: {
        implement: [
          [],
          [],
        ],
      },
    });
    const started = await service.start("42");
    const failed = await service.resume(started.id);
    const implementRequests = runner.startedRequests.filter((request) => request.taskType === "implement");

    expect(failed.status).toBe("failed");
    expect(failed.stage).toBe("implement");
    expect(failed.statusReason).toContain("no repository changes after retry");
    expect(implementRequests).toHaveLength(2);
    expect(implementRequests[1]?.continuation?.reason).toBe("retry_no_progress");

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

    const previous = process.env.DEVAGENT_HUB_SKIP_BASELINE_CHECKS;
    delete process.env.DEVAGENT_HUB_SKIP_BASELINE_CHECKS;
    try {
      await expect(service.resume(stale.id)).rejects.toMatchObject({
        code: "STALE_BASELINE",
        name: "WorkflowStateError",
      } satisfies Partial<WorkflowStateError>);
    } finally {
      process.env.DEVAGENT_HUB_SKIP_BASELINE_CHECKS = previous ?? "1";
    }

    store.close();
  });

  it("fails resume when the recorded base branch SHA has drifted", async () => {
    const { store, service } = await createService();
    const started = await service.start("42");
    const stale = store.updateWorkflowInstance(started.id, {
      baseSha: "deadbeef",
    });

    const previous = process.env.DEVAGENT_HUB_SKIP_BASELINE_CHECKS;
    delete process.env.DEVAGENT_HUB_SKIP_BASELINE_CHECKS;
    try {
      await expect(service.resume(stale.id)).rejects.toMatchObject({
        code: "STALE_BRANCH_REF",
        name: "WorkflowStateError",
      } satisfies Partial<WorkflowStateError>);
    } finally {
      process.env.DEVAGENT_HUB_SKIP_BASELINE_CHECKS = previous ?? "1";
    }

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
      body: "Please simplify the status output and remove the debug branch.",
      createdAt: "2026-03-10T00:00:00.000Z",
      path: "src/cli/index.ts",
      line: 25,
    }];
    github.ciFailureLogs = [{
      check: "Typecheck, Test, Build",
      log: "src/cli/index.ts:10:7 - error TS2322: Type 'string' is not assignable to type 'number'.",
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
    expect(github.resolvedThreads).toHaveLength(0);
    expect(runner.cleanedRuns).toHaveLength(2);
    expect(runner.startedRequests.at(-3)?.taskType).toBe("repair");
    expect(runner.startedRequests.at(-3)?.context.comments?.[0]?.body).toContain("src/cli/index.ts:25");
    expect(runner.startedRequests.at(-3)?.context.changedFilesHint).toEqual(["src/cli/index.ts"]);
    expect(runner.startedRequests.at(-3)?.context.extraInstructions?.join("\n")).toContain("Typecheck, Test, Build");
    expect(runner.startedRequests.at(-3)?.context.extraInstructions?.join("\n")).toContain("src/cli/index.ts:25");
    const repairTask = [...snapshot.tasks].reverse().find((task) => task.type === "repair");
    const repairResult = snapshot.results.find((result) => result.taskId === repairTask?.id);
    expect(repairResult?.result.repairOutcome).toEqual({
      unresolvedCommentCount: 1,
      ciFailureCount: 1,
      pushedCommit: true,
      pushedSha: "abc123",
    });

    store.close();
  }, 15_000);

  it("records a successful no-op repair outcome when no commit is pushed", async () => {
    const { store, service, github } = await createService([
      "No defects found.",
      "No defects found.",
    ]);
    const started = await service.start("42");
    await service.resume(started.id);
    await service.openPr(started.id);

    github.reviewComments = [{
      id: 1,
      nodeId: "PRRC_kwDONoop",
      isResolved: false,
      author: "reviewer",
      body: "Nit: double-check this wording.",
      createdAt: "2026-03-10T00:00:00.000Z",
      path: "README.md",
      line: 4,
    }];
    github.nextPushResult = { pushedCommit: false };
    await service.repairPr(started.id);

    const snapshot = service.getSnapshot(started.id);
    const repairTask = [...snapshot.tasks].reverse().find((task) => task.type === "repair");
    const repairResult = snapshot.results.find((result) => result.taskId === repairTask?.id);

    expect(repairResult?.result.repairOutcome).toEqual({
      unresolvedCommentCount: 1,
      ciFailureCount: 0,
      pushedCommit: false,
    });

    store.close();
  }, 15_000);

  it("ignores resolved review comments when building repair context", async () => {
    const { store, service, github, runner } = await createService([
      "No defects found.",
      "No defects found.",
    ]);
    const started = await service.start("42");
    await service.resume(started.id);
    await service.openPr(started.id);

    github.reviewComments = [
      {
        id: 1,
        nodeId: "PRRC_kwDOResolved",
        isResolved: true,
        author: "reviewer",
        body: "Old resolved note.",
        createdAt: "2026-03-10T00:00:00.000Z",
        path: "README.md",
        line: 3,
      },
      {
        id: 2,
        nodeId: "PRRC_kwDOOpen",
        isResolved: false,
        author: "reviewer",
        body: "Please fix the branch naming guidance.",
        createdAt: "2026-03-10T00:00:01.000Z",
        path: "src/cli/index.ts",
        line: 25,
      },
    ];

    await service.repairPr(started.id);

    const repairRequest = runner.startedRequests.at(-3);
    expect(repairRequest?.taskType).toBe("repair");
    expect(repairRequest?.context.comments).toHaveLength(1);
    expect(repairRequest?.context.comments?.[0]?.body).toContain("src/cli/index.ts:25");
    expect(repairRequest?.context.extraInstructions?.join("\n")).not.toContain("Old resolved note.");

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
