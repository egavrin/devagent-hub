#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CanonicalStore } from "../persistence/canonical-store.js";
import { GhCliGateway } from "../github/gh-cli-gateway.js";
import { loadWorkflowConfig } from "../workflow/config.js";
import { LocalRunnerClient } from "../runner-client/local-runner-client.js";
import { WorkflowService } from "../workflows/service.js";
import { resolveReviewableImportRepoRoot } from "./reviewable-import.js";

const CONFIG_DIR = join(homedir(), ".config", "devagent-hub");
const DB_PATH = join(CONFIG_DIR, "state.db");

function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

function detectRepoRoot(cwd = process.cwd()): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf-8",
  }).trim();
}

function detectRepoFullName(cwd = process.cwd()): string {
  try {
    const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/);
    if (httpsMatch?.[1]) {
      return httpsMatch[1];
    }
  } catch {
    // Fall back to gh CLI when origin is unavailable or unparsable.
  }

  try {
    const raw = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return (JSON.parse(raw) as { nameWithOwner: string }).nameWithOwner;
  } catch {
    // Local-only repositories without a remote should still be runnable.
    return cwd;
  }
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function argValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) {
      values.push(args[index + 1]!);
      index += 1;
    }
  }
  return values;
}

function createService(repoRootOverride?: string): { store: CanonicalStore; service: WorkflowService; repoRoot: string } {
  ensureConfigDir();
  const repoRoot = repoRootOverride ?? detectRepoRoot();
  const repoFullName = detectRepoFullName(repoRoot);
  const config = loadWorkflowConfig(repoRoot);
  const store = new CanonicalStore(DB_PATH);
  const project = store.upsertProject({
    id: repoFullName,
    name: repoFullName.split("/")[1] ?? repoFullName,
    repoRoot,
    repoFullName,
    workflowConfigPath: join(repoRoot, "WORKFLOW.md"),
    allowedExecutors: ["devagent", "codex", "claude", "opencode"],
  });
  return {
    store,
    repoRoot,
    service: new WorkflowService(
      store,
      new GhCliGateway(),
      new LocalRunnerClient(config),
      project,
      config,
    ),
  };
}

function resolveWorkflowRepoRoot(store: CanonicalStore, workflowId: string): string {
  const workflow = store.getWorkflowInstance(workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }
  const workspace = store.getWorkspace(workflow.workspaceId) ?? store.getWorkspace(workflow.projectId);
  const primaryRepositoryId =
    workflow.targetRepositoryIds?.[0]
    ?? workspace?.primaryRepositoryId
    ?? `${workflow.workspaceId ?? workflow.projectId}:primary`;
  const repository = store.getRepository(primaryRepositoryId);
  const project = store.getProject(workflow.projectId);
  const repoRoot = repository?.repoRoot ?? project?.repoRoot;
  if (!repoRoot) {
    throw new Error(`Workflow ${workflowId} is missing a repository root`);
  }
  return repoRoot;
}

function createServiceForWorkflow(workflowId: string): { store: CanonicalStore; service: WorkflowService; repoRoot: string } {
  const store = createStore();
  try {
    const repoRoot = resolveWorkflowRepoRoot(store, workflowId);
    store.close();
    return createService(repoRoot);
  } catch (error) {
    store.close();
    throw error;
  }
}

function resolveWorkItemRepoRoot(store: CanonicalStore, workItemId: string): string {
  const workItem = store.getWorkItem(workItemId);
  if (!workItem) {
    throw new Error(`Work item ${workItemId} not found`);
  }
  const workspaceId = workItem.workspaceId ?? workItem.projectId;
  const workspace = store.getWorkspace(workspaceId);
  const repositoryId =
    workItem.repositoryId
    ?? workspace?.primaryRepositoryId
    ?? `${workspaceId}:primary`;
  const repository = store.getRepository(repositoryId);
  const project = store.getProject(workItem.projectId);
  const repoRoot = repository?.repoRoot ?? project?.repoRoot;
  if (!repoRoot) {
    throw new Error(`Work item ${workItemId} is missing a repository root`);
  }
  return repoRoot;
}

function createServiceForWorkItem(workItemId: string): { store: CanonicalStore; service: WorkflowService; repoRoot: string } {
  const store = createStore();
  try {
    const repoRoot = resolveWorkItemRepoRoot(store, workItemId);
    store.close();
    return createService(repoRoot);
  } catch (error) {
    store.close();
    throw error;
  }
}

function createServiceForReviewableImport(
  workspaceId: string,
  repositoryId: string,
): { store: CanonicalStore; service: WorkflowService; repoRoot: string } {
  const store = createStore();
  try {
    const repoRoot = resolveReviewableImportRepoRoot(store, workspaceId, repositoryId);
    store.close();
    return createService(repoRoot);
  } catch (error) {
    store.close();
    throw error;
  }
}

function createStore(): CanonicalStore {
  ensureConfigDir();
  return new CanonicalStore(DB_PATH);
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function spawnDetachedContinue(workflowId: string, cwd = process.cwd()): void {
  const scriptPath = process.argv[1];
  if (!scriptPath) {
    throw new Error("Unable to determine devagent-hub CLI entrypoint for detached continuation.");
  }
  const runtimePath = resolveDetachedRuntime();

  const child = spawn(
    runtimePath,
    [scriptPath, "run", "continue", workflowId],
    {
      cwd,
      detached: true,
      stdio: "ignore",
      env: process.env,
    },
  );
  child.unref();
}

function resolveDetachedRuntime(): string {
  if (!process.versions.bun) {
    return process.execPath;
  }
  const candidates = [
    process.env.DEVAGENT_HUB_NODE_PATH,
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return process.execPath;
}

function formatStatus(view: ReturnType<WorkflowService["getStatusView"]>): string {
  const artifactLines = Object.entries(view.artifacts)
    .map(([kind, path]) => `  ${kind}: ${path}`)
    .join("\n");
  const approvalLines = view.approvalHistory
    .map((approval) => {
      const note = approval.note ? ` (${approval.note})` : "";
      return `  ${approval.stage}: ${approval.status}${note}`;
    })
    .join("\n");
  const latestResult = view.latestResult
    ? `${view.latestResult.taskType}: ${view.latestResult.status}${view.latestResult.error ? ` (${view.latestResult.error.code}: ${view.latestResult.error.message})` : ""}`
    : "none yet";

  return [
    `Workflow: ${view.workflowId}`,
    `Issue: #${view.issue.externalId} ${view.issue.title}`,
    `URL: ${view.issue.url}`,
    `Stage: ${view.stage}`,
    `Status: ${view.status}`,
    `Approval pending: ${view.approvalPending ? `yes (${view.approvalStage})` : "no"}`,
    `Status reason: ${view.statusReason ?? "none"}`,
    `Latest result: ${latestResult}`,
    "Artifacts:",
    artifactLines || "  none yet",
    "Approvals:",
    approvalLines || "  none yet",
    `Next action: ${view.nextAction}`,
  ].join("\n");
}

function printHelp(): void {
  console.log(`devagent-hub

Commands:
  workspace add
  list-workspaces [--json]
  repo add --workspace <workspaceId>
  list-repositories --workspace <workspaceId> [--json]
  project add
  list-projects [--json]
  task create-local --workspace <workspaceId> --title <title>
  list-tasks --workspace <workspaceId> [--json]
  issue sync
  list-issues --project <projectId> [--json]
  reviewable import --workspace <workspaceId> --repository <repoId> --pr <number>
  list-reviewables --workspace <workspaceId> [--json]
  run start --issue <number> [--detach]
  run start --task <taskId> [--repo <repositoryId>] [--detach]
  run continue <id>
  run resume <id>
  run reject <id> --note <text>
  run cancel <id>
  run archive <id>
  run supersede <id> --by <workflowId>
  pr open <id>
  pr repair <id>
  list [--json] [--grouped]
  status <id> [--json]
  help
`);
}

const [command, subcommand, ...args] = process.argv.slice(2);

if (!command || command === "help") {
  printHelp();
  process.exit(0);
}

if (command === "workspace" && subcommand === "add") {
  const store = createStore();
  try {
    const provider = (argValue(args, "--provider") ?? "github") as "github" | "local";
    const repoRoot = argValue(args, "--repo-root") ?? detectRepoRoot();
    const repoFullName = provider === "github"
      ? (argValue(args, "--repo-full-name") ?? detectRepoFullName())
      : argValue(args, "--repo-full-name");
    const workspaceId = argValue(args, "--id") ?? (repoFullName ?? repoRoot);
    const repositoryId = argValue(args, "--repository-id") ?? `${workspaceId}:primary`;
    const name = argValue(args, "--name")
      ?? repoFullName?.split("/")[1]
      ?? workspaceId.split("/").at(-1)
      ?? "workspace";
    const workspace = store.upsertWorkspace({
      id: workspaceId,
      name,
      provider,
      primaryRepositoryId: repositoryId,
      workflowConfigPath: join(repoRoot, "WORKFLOW.md"),
      allowedExecutors: ["devagent", "codex", "claude", "opencode"],
    });
    const repository = store.upsertRepository({
      id: repositoryId,
      workspaceId,
      alias: argValue(args, "--alias") ?? "primary",
      name,
      repoRoot,
      repoFullName: repoFullName ?? undefined,
      defaultBranch: argValue(args, "--default-branch") ?? "main",
      provider,
    });
    console.log(JSON.stringify({ workspace, repository }, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "list-workspaces") {
  const store = createStore();
  try {
    const workspaces = store.listWorkspaces();
    if (hasFlag([subcommand, ...args].filter(Boolean) as string[], "--json")) {
      console.log(JSON.stringify(workspaces));
    } else {
      for (const workspace of workspaces) {
        console.log(`${workspace.id}  ${workspace.name}  ${workspace.provider}`);
      }
    }
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "repo" && subcommand === "add") {
  const workspaceId = argValue(args, "--workspace");
  const repoRoot = argValue(args, "--path");
  if (!workspaceId || !repoRoot) {
    throw new Error("Usage: devagent-hub repo add --workspace <workspaceId> --path <repoRoot>");
  }
  const store = createStore();
  try {
    const repository = store.upsertRepository({
      id: argValue(args, "--id") ?? `${workspaceId}:${argValue(args, "--alias") ?? "repo"}`,
      workspaceId,
      alias: argValue(args, "--alias") ?? "repo",
      name: argValue(args, "--name") ?? repoRoot.split("/").at(-1) ?? "repo",
      repoRoot,
      repoFullName: argValue(args, "--repo-full-name"),
      defaultBranch: argValue(args, "--default-branch") ?? "main",
      provider: (argValue(args, "--provider") as "github" | "local" | undefined) ?? "local",
    });
    console.log(JSON.stringify(repository, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "list-repositories") {
  const allArgs = [subcommand, ...args].filter(Boolean) as string[];
  const workspaceId = argValue(allArgs, "--workspace");
  if (!workspaceId) {
    throw new Error("Usage: devagent-hub list-repositories --workspace <workspaceId> [--json]");
  }
  const store = createStore();
  try {
    const repositories = store.listRepositories(workspaceId);
    if (hasFlag(allArgs, "--json")) {
      console.log(JSON.stringify(repositories));
    } else {
      for (const repository of repositories) {
        console.log(`${repository.id}  ${repository.alias}  ${repository.repoRoot}`);
      }
    }
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "project" && subcommand === "add") {
  const { store } = createService();
  try {
    const repoRoot = detectRepoRoot();
    const repoFullName = detectRepoFullName();
    const project = store.upsertProject({
      id: repoFullName,
      name: argValue(args, "--name") ?? (repoFullName.split("/")[1] ?? repoFullName),
      repoRoot: argValue(args, "--repo-root") ?? repoRoot,
      repoFullName,
      workflowConfigPath: join(repoRoot, "WORKFLOW.md"),
      allowedExecutors: ["devagent", "codex", "claude", "opencode"],
    });
    console.log(JSON.stringify(project, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "issue" && subcommand === "sync") {
  const { store, service } = createService();
  try {
    const items = await service.syncIssues();
    console.log(JSON.stringify(items, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "task" && subcommand === "create-local") {
  const workspaceId = argValue(args, "--workspace");
  const title = argValue(args, "--title");
  if (!workspaceId || !title) {
    throw new Error("Usage: devagent-hub task create-local --workspace <workspaceId> --title <title>");
  }
  const store = createStore();
  try {
    const task = store.createLocalTask({
      workspaceId,
      title,
      description: argValue(args, "--description"),
      repositoryId: argValue(args, "--repository"),
      labels: argValues(args, "--label"),
    });
    console.log(JSON.stringify(task, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "list-tasks") {
  const allArgs = [subcommand, ...args].filter(Boolean) as string[];
  const workspaceId = argValue(allArgs, "--workspace");
  if (!workspaceId) {
    throw new Error("Usage: devagent-hub list-tasks --workspace <workspaceId> [--json]");
  }
  const store = createStore();
  try {
    const items = store.listWorkspaceWorkItems(workspaceId);
    if (hasFlag(allArgs, "--json")) {
      console.log(JSON.stringify(items));
    } else {
      for (const item of items) {
        console.log(`${item.id}  ${item.kind}  ${item.title}`);
      }
    }
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "reviewable" && subcommand === "import") {
  const workspaceId = argValue(args, "--workspace");
  const repositoryId = argValue(args, "--repository");
  const prNumber = argValue(args, "--pr");
  if (!workspaceId || !repositoryId || !prNumber) {
    throw new Error("Usage: devagent-hub reviewable import --workspace <workspaceId> --repository <repoId> --pr <number>");
  }
  const { store, service } = createServiceForReviewableImport(workspaceId, repositoryId);
  try {
    const reviewable = await service.importReviewable({
      workspaceId,
      repositoryId,
      externalId: prNumber,
      title: argValue(args, "--title"),
      url: argValue(args, "--url"),
      state: argValue(args, "--state"),
    });
    console.log(JSON.stringify(reviewable, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "reviewable" && subcommand === "get") {
  const reviewableId = args[0];
  if (!reviewableId) {
    throw new Error("Usage: devagent-hub reviewable get <id> [--json]");
  }
  const store = createStore();
  try {
    const reviewable = store.getReviewable(reviewableId);
    if (!reviewable) {
      throw new Error(`Reviewable ${reviewableId} not found`);
    }
    if (hasFlag(args, "--json")) {
      console.log(JSON.stringify(reviewable, null, 2));
    } else {
      console.log(`${reviewable.id}  ${reviewable.type}  ${reviewable.title}`);
    }
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "list-reviewables") {
  const allArgs = [subcommand, ...args].filter(Boolean) as string[];
  const workspaceId = argValue(allArgs, "--workspace");
  if (!workspaceId) {
    throw new Error("Usage: devagent-hub list-reviewables --workspace <workspaceId> [--json]");
  }
  const store = createStore();
  try {
    const reviewables = store.listReviewables(workspaceId);
    if (hasFlag(allArgs, "--json")) {
      console.log(JSON.stringify(reviewables));
    } else {
      for (const reviewable of reviewables) {
        console.log(`${reviewable.id}  ${reviewable.type}  ${reviewable.title}`);
      }
    }
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "run" && subcommand === "start") {
  const detached = hasFlag(args, "--detach");
  const issueNumber = argValue(args, "--issue");
  const taskId = argValue(args, "--task");
  const targetRepositoryIds = argValues(args, "--repo");
  if (!issueNumber && !taskId) {
    throw new Error("Usage: devagent-hub run start --issue <number> | --task <taskId>");
  }
  const { store, service, repoRoot } = taskId ? createServiceForWorkItem(taskId) : createService();
  try {
    const workflow = issueNumber
      ? (detached ? await service.startDetached(issueNumber) : await service.start(issueNumber))
      : (detached
          ? await service.startDetachedForWorkItem(taskId!, targetRepositoryIds)
          : await service.startForWorkItem(taskId!, targetRepositoryIds));
    if (detached) {
      spawnDetachedContinue(workflow.id, repoRoot);
    }
    console.log(JSON.stringify(workflow, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "run" && subcommand === "archive") {
  const workflowId = args[0];
  if (!workflowId) {
    throw new Error("Usage: devagent-hub run archive <id>");
  }
  const store = createStore();
  try {
    console.log(JSON.stringify(store.archiveWorkflow(workflowId), null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "run" && subcommand === "supersede") {
  const workflowId = args[0];
  const byWorkflowId = argValue(args, "--by");
  if (!workflowId || !byWorkflowId) {
    throw new Error("Usage: devagent-hub run supersede <id> --by <workflowId>");
  }
  const store = createStore();
  try {
    console.log(JSON.stringify(store.supersedeWorkflow(workflowId, byWorkflowId), null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "run" && subcommand === "continue") {
  const workflowId = args[0];
  if (!workflowId) {
    throw new Error("Usage: devagent-hub run continue <id>");
  }
  const { store, service } = createServiceForWorkflow(workflowId);
  try {
    const workflow = await service.continue(workflowId);
    console.log(JSON.stringify(workflow, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      service.markWorkflowFailed(workflowId, message);
    } catch {
      // Ignore secondary persistence failures — preserve the original error.
    }
    throw error;
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "run" && subcommand === "resume") {
  const workflowId = args[0];
  if (!workflowId) {
    throw new Error("Usage: devagent-hub run resume <id>");
  }
  const { store, service } = createServiceForWorkflow(workflowId);
  try {
    const workflow = await service.resume(workflowId);
    console.log(JSON.stringify(workflow, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "run" && subcommand === "reject") {
  const workflowId = args[0];
  const note = argValue(args, "--note");
  if (!workflowId || !note) {
    throw new Error("Usage: devagent-hub run reject <id> --note <text>");
  }
  const { store, service } = createServiceForWorkflow(workflowId);
  try {
    const workflow = await service.reject(workflowId, note);
    console.log(JSON.stringify(workflow, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "run" && subcommand === "cancel") {
  const workflowId = args[0];
  if (!workflowId) {
    throw new Error("Usage: devagent-hub run cancel <id>");
  }
  const { store, service } = createServiceForWorkflow(workflowId);
  try {
    const workflow = await service.cancel(workflowId);
    console.log(JSON.stringify(workflow, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "pr" && subcommand === "open") {
  const workflowId = args[0];
  if (!workflowId) {
    throw new Error("Usage: devagent-hub pr open <id>");
  }
  const { store, service } = createServiceForWorkflow(workflowId);
  try {
    const workflow = await service.openPr(workflowId);
    console.log(JSON.stringify(workflow, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "pr" && subcommand === "repair") {
  const workflowId = args[0];
  if (!workflowId) {
    throw new Error("Usage: devagent-hub pr repair <id>");
  }
  const { store, service } = createServiceForWorkflow(workflowId);
  try {
    const workflow = await service.repairPr(workflowId);
    console.log(JSON.stringify(workflow, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "list-projects") {
  const store = createStore();
  try {
    const projects = store.listProjects();
    if (hasFlag([subcommand, ...args].filter(Boolean) as string[], "--json")) {
      console.log(JSON.stringify(projects));
    } else {
      for (const p of projects) {
        console.log(`${p.id}  ${p.name}  ${p.repoRoot}`);
      }
    }
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "list-issues") {
  const allArgs = [subcommand, ...args].filter(Boolean) as string[];
  const projectId = argValue(allArgs, "--project");
  if (!projectId) {
    throw new Error("Usage: devagent-hub list-issues --project <projectId> [--json]");
  }
  const store = createStore();
  try {
    const items = store.listWorkItems(projectId);
    if (hasFlag(allArgs, "--json")) {
      console.log(JSON.stringify(items));
    } else {
      for (const item of items) {
        console.log(`#${item.externalId}  ${item.title}  ${item.state}`);
      }
    }
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "list") {
  const grouped = subcommand === "--grouped" || hasFlag(args, "--grouped");
  const { store, service } = createService();
  try {
    const workflows = grouped ? store.listWorkflowGroups() : service.listWorkflows();
    if (subcommand === "--json" || hasFlag(args, "--json")) {
      console.log(JSON.stringify(workflows));
    } else {
      console.log(JSON.stringify(workflows, null, 2));
    }
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "status") {
  const workflowId = subcommand;
  if (!workflowId) {
    throw new Error("Usage: devagent-hub status <id> [--json]");
  }
  const { store, service } = createServiceForWorkflow(workflowId);
  try {
    if (hasFlag(args, "--json")) {
      console.log(JSON.stringify(service.getSnapshot(workflowId), null, 2));
    } else {
      console.log(formatStatus(service.getStatusView(workflowId)));
    }
  } finally {
    store.close();
  }
  process.exit(0);
}

throw new Error(`Unknown command: ${[command, subcommand].filter(Boolean).join(" ")}`);
