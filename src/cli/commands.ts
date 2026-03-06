import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { StateStore } from "../state/store.js";
import { GhCliGateway } from "../github/gh-cli-gateway.js";
import { WorktreeManager } from "../workspace/worktree-manager.js";
import type { WorkflowStatus } from "../state/types.js";
import { WorkflowOrchestrator } from "../workflow/orchestrator.js";
import { loadWorkflowConfig } from "../workflow/config.js";
import { RunLauncher } from "../runner/launcher.js";

const CONFIG_DIR = join(homedir(), ".config", "devagent-hub");
const DB_PATH = join(CONFIG_DIR, "state.db");

function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

function createStore(): StateStore {
  ensureConfigDir();
  return new StateStore(DB_PATH);
}

function detectRepo(args: string[]): string {
  const idx = args.indexOf("--repo");
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  // Detect from gh CLI
  const raw = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner"], {
    encoding: "utf-8",
  });
  const parsed = JSON.parse(raw) as { nameWithOwner: string };
  return parsed.nameWithOwner;
}

function detectRepoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf-8",
  }).trim();
}

export async function runCommand(args: string[]): Promise<void> {
  const issueNumber = parseInt(args[0], 10);
  if (!issueNumber || isNaN(issueNumber)) {
    console.error("Usage: devagent-hub run <issue-number> [--repo owner/repo] [--auto-approve]");
    process.exit(1);
  }

  const repo = detectRepo(args);
  const repoRoot = detectRepoRoot();
  const store = createStore();

  try {
    const config = loadWorkflowConfig(repoRoot);
    const worktreeManager = new WorktreeManager(repoRoot);
    const orchestrator = new WorkflowOrchestrator({
      store,
      github: new GhCliGateway(),
      launcher: new RunLauncher({
        devagentBin: "devagent",
        artifactsDir: join(homedir(), ".config", "devagent-hub", "artifacts"),
        timeout: 10 * 60 * 1000,
        approvalMode: config.runner.approval_mode,
        maxIterations: config.runner.max_iterations,
      }),
      repo,
      repoRoot,
      config,
      worktreeManager,
    });

    const autoApprove = args.includes("--auto-approve");
    console.log(`Starting workflow for issue #${issueNumber}...`);
    const run = await orchestrator.runWorkflow(issueNumber, { autoApprove });

    console.log(`\nWorkflow complete.`);
    console.log(`  Status: ${run.status}`);
    console.log(`  Run ID: ${run.id}`);
    if (run.prUrl) console.log(`  PR: ${run.prUrl}`);
  } finally {
    store.close();
  }
}

export async function triageCommand(args: string[]): Promise<void> {
  const issueNumber = parseInt(args[0], 10);
  if (!issueNumber || isNaN(issueNumber)) {
    console.error("Usage: devagent-hub triage <issue-number> [--repo owner/repo]");
    process.exit(1);
  }

  const repo = detectRepo(args);
  const repoRoot = detectRepoRoot();
  const store = createStore();

  try {
    const config = loadWorkflowConfig(repoRoot);
    const orchestrator = new WorkflowOrchestrator({
      store,
      github: new GhCliGateway(),
      launcher: new RunLauncher({
        devagentBin: "devagent",
        artifactsDir: join(homedir(), ".config", "devagent-hub", "artifacts"),
        timeout: 10 * 60 * 1000,
        approvalMode: config.runner.approval_mode,
        maxIterations: config.runner.max_iterations,
      }),
      repo,
      repoRoot,
      config,
    });

    console.log(`Running triage for issue #${issueNumber}...`);
    const run = await orchestrator.triageAndPlan(issueNumber);

    console.log(`\nTriage complete.`);
    console.log(`  Status: ${run.status}`);
    console.log(`  Run ID: ${run.id}`);
  } finally {
    store.close();
  }
}

export function statusCommand(args: string[]): void {
  const runId = args[0];
  if (!runId) {
    console.error("Usage: devagent-hub status <run-id>");
    process.exit(1);
  }

  const store = createStore();
  try {
    const run = store.getWorkflowRun(runId);
    if (!run) {
      console.error(`Workflow run not found: ${runId}`);
      process.exit(1);
    }

    console.log(JSON.stringify(run, null, 2));

    const transitions = store.getTransitions(runId);
    if (transitions.length > 0) {
      console.log("\nTransitions:");
      for (const t of transitions) {
        console.log(`  ${t.from} -> ${t.to} at ${t.timestamp} (${t.reason})`);
      }
    }
  } finally {
    store.close();
  }
}

export function listCommand(): void {
  const store = createStore();
  try {
    const statuses: WorkflowStatus[] = [
      "new",
      "triaged",
      "plan_draft",
      "plan_revision",
      "plan_accepted",
      "implementing",
      "awaiting_local_verify",
      "draft_pr_opened",
      "auto_review_fix_loop",
      "awaiting_human_review",
      "ready_to_merge",
      "done",
      "escalated",
      "failed",
    ];

    let totalCount = 0;
    for (const status of statuses) {
      const runs = store.listByStatus(status);
      if (runs.length === 0) continue;
      totalCount += runs.length;

      console.log(`\n[${status}] (${runs.length})`);
      for (const run of runs) {
        console.log(
          `  ${run.id}  #${run.issueNumber}  ${run.repo}  ${run.createdAt}`,
        );
      }
    }

    if (totalCount === 0) {
      console.log("No workflow runs found.");
    }
  } finally {
    store.close();
  }
}
