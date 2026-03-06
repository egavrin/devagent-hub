import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { StateStore } from "../state/store.js";
import { GhCliGateway } from "../github/gh-cli-gateway.js";
import { WorktreeManager } from "../workspace/worktree-manager.js";
import type { WorkflowStatus } from "../state/types.js";

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
    console.error("Usage: devagent-hub run <issue-number> [--repo owner/repo]");
    process.exit(1);
  }

  const repo = detectRepo(args);
  const repoRoot = detectRepoRoot();
  const store = createStore();
  const gh = new GhCliGateway();

  try {
    // 1. Fetch issue
    console.log(`Fetching issue #${issueNumber} from ${repo}...`);
    const issue = await gh.fetchIssue(repo, issueNumber);

    // 2. Create workflow run
    const run = store.createWorkflowRun({
      issueNumber: issue.number,
      issueUrl: issue.url,
      repo,
      metadata: { title: issue.title },
    });
    console.log(`Created workflow run: ${run.id}`);

    // 3. Transition to triaged
    store.updateStatus(run.id, "triaged", "CLI run command");

    // 4. Add da:running label
    console.log("Adding da:running label...");
    await gh.addLabels(repo, issueNumber, ["da:running"]);

    // 5. Create worktree
    console.log("Creating worktree...");
    const worktreeManager = new WorktreeManager(repoRoot);
    const worktree = worktreeManager.create(issueNumber, repoRoot);
    store.updateWorkflowRun(run.id, {
      branch: worktree.branch,
      worktreePath: worktree.path,
    });
    console.log(`Worktree created: ${worktree.path} (branch: ${worktree.branch})`);

    // 6. Post triage summary as issue comment
    const triageSummary = [
      `## Triage Summary`,
      ``,
      `- **Issue:** #${issue.number} — ${issue.title}`,
      `- **Workflow Run:** \`${run.id}\``,
      `- **Branch:** \`${worktree.branch}\``,
      `- **Worktree:** \`${worktree.path}\``,
      `- **Status:** triaged`,
    ].join("\n");

    console.log("Posting triage summary...");
    await gh.addComment(repo, issueNumber, triageSummary);

    // 7. Report status
    console.log("\n--- Workflow Status ---");
    const updated = store.getWorkflowRun(run.id);
    console.log(JSON.stringify(updated, null, 2));
  } finally {
    store.close();
  }
}

export async function triageCommand(args: string[]): Promise<void> {
  const issueNumber = parseInt(args[0], 10);
  if (!issueNumber || isNaN(issueNumber)) {
    console.error(
      "Usage: devagent-hub triage <issue-number> [--repo owner/repo]",
    );
    process.exit(1);
  }

  const repo = detectRepo(args);
  const store = createStore();
  const gh = new GhCliGateway();

  try {
    // Fetch issue
    console.log(`Fetching issue #${issueNumber} from ${repo}...`);
    const issue = await gh.fetchIssue(repo, issueNumber);

    // Create or fetch existing workflow run
    let run = store.getWorkflowRunByIssue(repo, issueNumber);
    if (!run) {
      run = store.createWorkflowRun({
        issueNumber: issue.number,
        issueUrl: issue.url,
        repo,
        metadata: { title: issue.title },
      });
      console.log(`Created workflow run: ${run.id}`);
    } else {
      console.log(`Using existing workflow run: ${run.id}`);
    }

    // Transition to triaged
    if (run.status === "new") {
      store.updateStatus(run.id, "triaged", "CLI triage command");
    }

    // Add label
    await gh.addLabels(repo, issueNumber, ["da:triaged"]);

    // Post triage comment
    const triageSummary = [
      `## Triage Complete`,
      ``,
      `- **Issue:** #${issue.number} — ${issue.title}`,
      `- **Labels:** ${issue.labels.join(", ") || "(none)"}`,
      `- **Author:** ${issue.author}`,
      `- **Workflow Run:** \`${run.id}\``,
    ].join("\n");

    await gh.addComment(repo, issueNumber, triageSummary);
    console.log("Triage complete.");
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
