import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { RunnerClient } from "../runner-client/types.js";
import type { GitHubGateway, PushBranchResult } from "../github/gateway.js";
import type { GitHubCheck, GitHubComment, GitHubIssue, GitHubPR } from "../github/types.js";
import { CanonicalStore } from "../persistence/canonical-store.js";
import { WorkflowService } from "../workflows/service.js";
import { defaultConfig } from "../workflow/config.js";
import {
  loadBaselineManifest,
  readBaselineRepoStatuses,
  resolveBaselineRepoPath,
  resolveHubRoot,
  resolveWorkspaceRoot,
} from "./manifest.js";
import { PROTOCOL_VERSION, type TaskExecutionEvent, type TaskExecutionRequest, type TaskExecutionResult } from "@devagent-sdk/types";

export type TempHarness = {
  root: string;
  cleanup: () => Promise<void>;
};

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function repoPath(name: "devagent-sdk" | "devagent-runner" | "devagent" | "devagent-hub"): string {
  return resolveBaselineRepoPath(name, resolveWorkspaceRoot(resolveHubRoot()));
}

export function fixturePath(fileName: string): string {
  return join(repoPath("devagent-sdk"), "fixtures", fileName);
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf-8")) as T;
}

export async function createHarness(prefix: string): Promise<TempHarness> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  return {
    root,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Codex",
      GIT_AUTHOR_EMAIL: "codex@example.com",
      GIT_COMMITTER_NAME: "Codex",
      GIT_COMMITTER_EMAIL: "codex@example.com",
    },
  }).trim();
}

export async function initializeRepo(repoRoot: string): Promise<void> {
  await mkdir(repoRoot, { recursive: true });
  await writeFile(join(repoRoot, "README.md"), "# baseline test repo\n");
  git(repoRoot, ["init", "--initial-branch=main"]);
  git(repoRoot, ["add", "README.md"]);
  git(repoRoot, ["commit", "-m", "test: seed baseline repo"]);
}

export function currentWorkspaceSummary(): string {
  const manifest = loadBaselineManifest(resolveHubRoot());
  const statuses = readBaselineRepoStatuses(manifest, resolveWorkspaceRoot(resolveHubRoot()));
  return statuses
    .map((status) => `${status.name} ${status.headSha}${status.clean ? "" : " DIRTY"}`)
    .join("\n");
}

export class HarnessGitHubGateway implements GitHubGateway {
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

  async createPR(_repo: string, params: { head: string; base: string; title: string; body: string; draft: boolean }): Promise<GitHubPR> {
    return {
      number: 100,
      title: params.title,
      body: params.body,
      url: "https://github.com/example/repo/pull/100",
      state: "open",
      draft: params.draft,
      head: params.head,
      base: params.base,
      checks: [],
      reviewComments: [],
    };
  }

  async fetchPR(): Promise<GitHubPR> {
    return {
      number: 100,
      title: "PR",
      body: "",
      url: "https://github.com/example/repo/pull/100",
      state: "open",
      draft: true,
      head: "devagent/workflow/placeholder",
      base: "main",
      checks: [],
      reviewComments: [],
    };
  }

  async fetchPRChecks(): Promise<GitHubCheck[]> {
    return [];
  }

  async fetchPRReviewComments(): Promise<GitHubComment[]> {
    return [];
  }

  async pushBranch(): Promise<PushBranchResult> {
    return { pushedCommit: false };
  }
  async checkBranchConflicts(): Promise<{ conflicted: boolean; conflictFiles: string[] }> {
    return { conflicted: false, conflictFiles: [] };
  }
  async markPRReady(): Promise<void> {}
  async fetchCIFailureLogs(): Promise<{ check: string; log: string }[]> {
    return [];
  }
  async createIssue(): Promise<{ number: number; url: string }> {
    return { number: this.issue.number, url: this.issue.url };
  }
}

export class CapturingRunnerClient implements RunnerClient {
  readonly startedRequests: TaskExecutionRequest[] = [];
  private readonly requests = new Map<string, TaskExecutionRequest>();

  constructor(private readonly repoRoot: string) {}

  async startTask(request: TaskExecutionRequest): Promise<{ runId: string }> {
    git(this.repoRoot, ["branch", "-f", request.execution.repositories[0]!.workBranch, "main"]);
    const runId = `${request.taskType}-${request.taskId}`;
    this.requests.set(runId, request);
    this.startedRequests.push(request);
    return { runId };
  }

  async subscribe(_runId: string, onEvent: (event: TaskExecutionEvent) => void): Promise<void> {
    onEvent({
      protocolVersion: PROTOCOL_VERSION,
      type: "started",
      at: new Date().toISOString(),
      taskId: "task",
    });
    onEvent({
      protocolVersion: PROTOCOL_VERSION,
      type: "completed",
      at: new Date().toISOString(),
      taskId: "task",
      status: "success",
    });
  }

  async cancel(): Promise<void> {}

  async awaitResult(runId: string): Promise<TaskExecutionResult> {
    const request = this.requests.get(runId);
    assert(request, `Missing request for ${runId}`);
    const workspacePath = join(this.repoRoot, ".baseline-artifacts", runId);
    await mkdir(workspacePath, { recursive: true });
    const artifactPath = join(workspacePath, `${request.taskType}.md`);
    await writeFile(artifactPath, request.taskType === "review" ? "No defects found.\n" : `${request.taskType}\n`);
    const artifactKind = request.expectedArtifacts[0]!;
    const result: TaskExecutionResult = {
      protocolVersion: PROTOCOL_VERSION,
      taskId: request.taskId,
      status: "success",
      artifacts: [{
        kind: artifactKind,
        path: artifactPath,
        createdAt: new Date().toISOString(),
        mimeType: "text/markdown",
      }],
      metrics: {
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
      },
    };
    await writeFile(join(workspacePath, "result.json"), JSON.stringify(result, null, 2));
    return result;
  }

  async inspect(runId: string): Promise<{ workspacePath: string; resultPath: string; eventLogPath: string }> {
    const workspacePath = join(this.repoRoot, ".baseline-artifacts", runId);
    return {
      workspacePath,
      resultPath: join(workspacePath, "result.json"),
      eventLogPath: join(workspacePath, "events.jsonl"),
    };
  }

  async cleanupRun(): Promise<void> {}
}

export async function createCompatibilityService(): Promise<{
  harness: TempHarness;
  store: CanonicalStore;
  service: WorkflowService;
  runner: CapturingRunnerClient;
}> {
  const harness = await createHarness("devagent-hub-baseline-compat-");
  const dbPath = join(harness.root, "state.db");
  const repoRoot = join(harness.root, "repo");
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
    title: "Validate baseline orchestration",
    body: "Use the runner-backed execution path.",
    labels: ["devagent"],
    url: "https://github.com/org/repo/issues/42",
    state: "open",
    author: "eg",
    createdAt: "2026-03-10T00:00:00.000Z",
    comments: [],
  };
  const config = defaultConfig();
  config.runner.bin = "devagent";
  config.runner.provider = "chatgpt";
  config.runner.model = "gpt-5.4";
  const runner = new CapturingRunnerClient(repoRoot);
  const service = new WorkflowService(
    store,
    new HarnessGitHubGateway(issue),
    runner,
    project,
    config,
  );

  return { harness, store, service, runner };
}

export async function spawnProcess(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("exit", (code) => {
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function uniqueTaskId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function devagentCommandArgs(): { command: string; args: string[] } {
  return {
    command: "bun",
    args: [join(repoPath("devagent"), "packages/cli/dist/index.js")],
  };
}

export function repoLabel(name: string, repoRoot: string): string {
  return `${name} @ ${resolve(repoRoot)}`;
}
