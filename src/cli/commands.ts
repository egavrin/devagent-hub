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
        devagentBin: config.runner.bin ?? "devagent",
        artifactsDir: join(homedir(), ".config", "devagent-hub", "artifacts"),
        timeout: 10 * 60 * 1000,
        approvalMode: config.runner.approval_mode,
        maxIterations: config.runner.max_iterations,
        provider: config.runner.provider,
        model: config.runner.model,
        reasoning: config.runner.reasoning,
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
        devagentBin: config.runner.bin ?? "devagent",
        artifactsDir: join(homedir(), ".config", "devagent-hub", "artifacts"),
        timeout: 10 * 60 * 1000,
        approvalMode: config.runner.approval_mode,
        maxIterations: config.runner.max_iterations,
        provider: config.runner.provider,
        model: config.runner.model,
        reasoning: config.runner.reasoning,
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

  const jsonMode = args.includes("--json");

  const store = createStore();
  try {
    const run = store.getWorkflowRun(runId);
    if (!run) {
      console.error(`Workflow run not found: ${runId}`);
      process.exit(1);
    }

    if (jsonMode) {
      const agentRuns = store.getAgentRunsByWorkflow(runId);
      const artifacts = store.getArtifactsByWorkflow(runId);
      const transitions = store.getTransitions(runId);
      console.log(JSON.stringify({ run, agentRuns, artifacts, transitions }, null, 2));
      return;
    }

    const title = (run.metadata as Record<string, unknown>)?.title ?? "";
    console.log(`\n  #${run.issueNumber} ${title}`);
    console.log(`  ${"─".repeat(60)}`);
    console.log(`  Run ID:   ${run.id}`);
    console.log(`  Repo:     ${run.repo}`);
    console.log(`  Status:   ${run.status}${run.currentPhase ? ` (phase: ${run.currentPhase})` : ""}`);
    if (run.branch) console.log(`  Branch:   ${run.branch}`);
    if (run.prUrl) console.log(`  PR:       ${run.prUrl}`);
    if (run.repairRound > 0) console.log(`  Repairs:  ${run.repairRound} round(s)`);
    console.log(`  Created:  ${run.createdAt.replace("T", " ").slice(0, 19)}`);
    console.log(`  Updated:  ${run.updatedAt.replace("T", " ").slice(0, 19)}`);

    // Agent runs (phase history)
    const agentRuns = store.getAgentRunsByWorkflow(runId);
    if (agentRuns.length > 0) {
      console.log(`\n  Phases`);
      console.log(`  ${"─".repeat(60)}`);
      for (const ar of agentRuns) {
        const dur = formatCliDuration(ar.startedAt, ar.finishedAt);
        const mark = ar.status === "success" ? "ok" : ar.status === "failed" ? "FAIL" : ar.status;
        const iters = ar.iterations ? ` (${ar.iterations} iters)` : "";
        console.log(`  [${mark.padEnd(4)}] ${ar.phase.padEnd(10)} ${dur.padStart(8)}${iters}`);
      }
    }

    // Artifacts
    const artifacts = store.getArtifactsByWorkflow(runId);
    if (artifacts.length > 0) {
      console.log(`\n  Artifacts`);
      console.log(`  ${"─".repeat(60)}`);
      for (const a of artifacts) {
        const summary = a.summary.length > 55 ? a.summary.slice(0, 54) + "\u2026" : a.summary;
        console.log(`  ${a.type.padEnd(22)} ${summary}`);
      }
    }

    // Transitions
    const transitions = store.getTransitions(runId);
    if (transitions.length > 0) {
      console.log(`\n  Transitions`);
      console.log(`  ${"─".repeat(60)}`);
      for (const t of transitions) {
        const ts = t.timestamp.replace("T", " ").slice(0, 19);
        const reason = t.reason ? ` (${t.reason.length > 35 ? t.reason.slice(0, 34) + "\u2026" : t.reason})` : "";
        console.log(`  ${ts}  ${t.from} -> ${t.to}${reason}`);
      }
    }

    console.log();
  } finally {
    store.close();
  }
}

function formatCliDuration(start: string, end: string | null): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = e - s;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3600_000)}h${Math.floor((ms % 3600_000) / 60_000)}m`;
}

export async function uiCommand(args: string[]): Promise<void> {
  const repoRoot = detectRepoRoot();
  const repo = detectRepo(args);
  const store = createStore();
  const config = loadWorkflowConfig(repoRoot);

  const { ProcessRegistry } = await import("../runner/process-registry.js");
  const { StreamingLauncher } = await import("../runner/streaming-launcher.js");
  const { StreamingLauncherAdapter } = await import("../runner/streaming-adapter.js");
  const { launchTUI } = await import("../tui/index.js");

  const registry = new ProcessRegistry();

  const streamingLauncher = new StreamingLauncher({
    devagentBin: config.runner.bin ?? "devagent",
    artifactsDir: join(homedir(), ".config", "devagent-hub", "artifacts"),
    timeout: 10 * 60 * 1000,
    approvalMode: config.runner.approval_mode,
    maxIterations: config.runner.max_iterations,
    provider: config.runner.provider,
    model: config.runner.model,
    reasoning: config.runner.reasoning,
    registry,
  });

  const adapter = new StreamingLauncherAdapter(streamingLauncher);

  const worktreeManager = new WorktreeManager(repoRoot);
  const orchestrator = new WorkflowOrchestrator({
    store,
    github: new GhCliGateway(),
    launcher: adapter,
    repo,
    repoRoot,
    config,
    worktreeManager,
  });

  launchTUI({ store, registry, orchestrator });
}

export async function approveCommand(args: string[]): Promise<void> {
  const runId = args[0];
  if (!runId) {
    console.error("Usage: devagent-hub approve <run-id>");
    process.exit(1);
  }

  const store = createStore();
  try {
    const run = store.getWorkflowRun(runId);
    if (!run) {
      console.error(`Workflow run not found: ${runId}`);
      process.exit(1);
    }

    const repo = run.repo;
    const repoRoot = detectRepoRoot();
    const config = loadWorkflowConfig(repoRoot);

    const orchestrator = new WorkflowOrchestrator({
      store,
      github: new GhCliGateway(),
      launcher: new RunLauncher({
        devagentBin: config.runner.bin ?? "devagent",
        artifactsDir: join(homedir(), ".config", "devagent-hub", "artifacts"),
        timeout: 10 * 60 * 1000,
        approvalMode: config.runner.approval_mode,
        maxIterations: config.runner.max_iterations,
        provider: config.runner.provider,
        model: config.runner.model,
        reasoning: config.runner.reasoning,
      }),
      repo,
      repoRoot,
      config,
    });

    const updated = await orchestrator.approvePlan(run.issueNumber);
    console.log(`Plan approved for issue #${run.issueNumber}.`);
    console.log(`  Status: ${updated.status}`);
  } finally {
    store.close();
  }
}

export async function reworkCommand(args: string[]): Promise<void> {
  const runId = args[0];
  if (!runId) {
    console.error("Usage: devagent-hub rework <run-id> [--note \"...\"]");
    process.exit(1);
  }

  let note: string | undefined;
  const noteIdx = args.indexOf("--note");
  if (noteIdx !== -1 && args[noteIdx + 1]) {
    note = args[noteIdx + 1];
  }

  const store = createStore();
  try {
    const run = store.getWorkflowRun(runId);
    if (!run) {
      console.error(`Workflow run not found: ${runId}`);
      process.exit(1);
    }

    const repo = run.repo;
    const repoRoot = detectRepoRoot();
    const config = loadWorkflowConfig(repoRoot);

    const orchestrator = new WorkflowOrchestrator({
      store,
      github: new GhCliGateway(),
      launcher: new RunLauncher({
        devagentBin: config.runner.bin ?? "devagent",
        artifactsDir: join(homedir(), ".config", "devagent-hub", "artifacts"),
        timeout: 10 * 60 * 1000,
        approvalMode: config.runner.approval_mode,
        maxIterations: config.runner.max_iterations,
        provider: config.runner.provider,
        model: config.runner.model,
        reasoning: config.runner.reasoning,
      }),
      repo,
      repoRoot,
      config,
    });

    const updated = await orchestrator.reworkPlan(run.issueNumber, note);
    console.log(`Plan rework completed for issue #${run.issueNumber}.`);
    console.log(`  Status: ${updated.status}`);
  } finally {
    store.close();
  }
}

export async function resumeCommand(args: string[]): Promise<void> {
  const runId = args[0];
  if (!runId) {
    console.error("Usage: devagent-hub resume <run-id>");
    process.exit(1);
  }

  const store = createStore();
  try {
    const run = store.getWorkflowRun(runId);
    if (!run) {
      console.error(`Workflow run not found: ${runId}`);
      process.exit(1);
    }

    const repo = run.repo;
    const repoRoot = detectRepoRoot();
    const config = loadWorkflowConfig(repoRoot);
    const worktreeManager = new WorktreeManager(repoRoot);

    const orchestrator = new WorkflowOrchestrator({
      store,
      github: new GhCliGateway(),
      launcher: new RunLauncher({
        devagentBin: config.runner.bin ?? "devagent",
        artifactsDir: join(homedir(), ".config", "devagent-hub", "artifacts"),
        timeout: 10 * 60 * 1000,
        approvalMode: config.runner.approval_mode,
        maxIterations: config.runner.max_iterations,
        provider: config.runner.provider,
        model: config.runner.model,
        reasoning: config.runner.reasoning,
      }),
      repo,
      repoRoot,
      config,
      worktreeManager,
    });

    console.log(`Resuming run ${runId} from status "${run.status}"...`);

    // Resume from current status
    let updated = run;
    switch (run.status) {
      case "triaged":
        updated = await orchestrator.plan(run.issueNumber);
        break;
      case "plan_accepted":
        updated = await orchestrator.implement(run.issueNumber);
        if (updated.status !== "failed") {
          updated = await orchestrator.verify(run.issueNumber);
          if (updated.status === "awaiting_local_verify") {
            updated = await orchestrator.openPR(run.issueNumber);
          }
        }
        break;
      case "implementing":
        updated = await orchestrator.verify(run.issueNumber);
        if (updated.status === "awaiting_local_verify") {
          updated = await orchestrator.openPR(run.issueNumber);
        }
        break;
      case "awaiting_local_verify":
        updated = await orchestrator.openPR(run.issueNumber);
        break;
      case "draft_pr_opened":
        updated = await orchestrator.review(run.issueNumber);
        break;
      case "auto_review_fix_loop":
        updated = await orchestrator.repair(run.issueNumber);
        break;
      default:
        console.log(`Cannot resume from status "${run.status}".`);
        process.exit(1);
    }

    console.log(`\nResume complete.`);
    console.log(`  Status: ${updated.status}`);
    console.log(`  Run ID: ${updated.id}`);
    if (updated.prUrl) console.log(`  PR: ${updated.prUrl}`);
  } finally {
    store.close();
  }
}

export async function resolveCommentsCommand(args: string[]): Promise<void> {
  const issueNumber = parseInt(args[0], 10);
  if (!issueNumber || isNaN(issueNumber)) {
    console.error("Usage: devagent-hub resolve-comments <issue-number> [--repo owner/repo]");
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
        devagentBin: config.runner.bin ?? "devagent",
        artifactsDir: join(homedir(), ".config", "devagent-hub", "artifacts"),
        timeout: 10 * 60 * 1000,
        approvalMode: config.runner.approval_mode,
        maxIterations: config.runner.max_iterations,
        provider: config.runner.provider,
        model: config.runner.model,
        reasoning: config.runner.reasoning,
      }),
      repo,
      repoRoot,
      config,
      worktreeManager,
    });

    console.log(`Resolving review comments for issue #${issueNumber}...`);
    const run = await orchestrator.resolveComments(issueNumber);

    console.log(`\nDone.`);
    console.log(`  Status: ${run.status}`);
    console.log(`  Run ID: ${run.id}`);
    if (run.prUrl) console.log(`  PR: ${run.prUrl}`);
  } finally {
    store.close();
  }
}

export function artifactsCommand(args: string[]): void {
  const runId = args[0];
  if (!runId) {
    console.error("Usage: devagent-hub artifacts <run-id>");
    process.exit(1);
  }

  const store = createStore();
  try {
    const artifacts = store.getArtifactsByWorkflow(runId);
    if (artifacts.length === 0) {
      console.log("No artifacts found for this run.");
      return;
    }

    for (const a of artifacts) {
      console.log(`\n[${a.type}] (${a.phase}) ${a.createdAt}`);
      console.log(`  ${a.summary}`);
      if (a.filePath) console.log(`  File: ${a.filePath}`);
    }
  } finally {
    store.close();
  }
}

export function listCommand(args: string[] = []): void {
  const jsonMode = args.includes("--json");
  const store = createStore();
  try {
    const statuses: WorkflowStatus[] = [
      "new", "triaged", "plan_draft", "plan_revision", "plan_accepted",
      "implementing", "awaiting_local_verify", "draft_pr_opened",
      "auto_review_fix_loop", "awaiting_human_review", "ready_to_merge",
      "done", "escalated", "failed",
    ];

    const allRuns: Array<{ status: string; runs: ReturnType<typeof store.listByStatus> }> = [];
    let totalCount = 0;
    const statusCounts: Record<string, number> = {};

    for (const status of statuses) {
      const runs = store.listByStatus(status);
      if (runs.length > 0) {
        allRuns.push({ status, runs });
        totalCount += runs.length;
        statusCounts[status] = runs.length;
      }
    }

    if (jsonMode) {
      const flat = allRuns.flatMap((g) => g.runs);
      console.log(JSON.stringify(flat, null, 2));
      return;
    }

    if (totalCount === 0) {
      console.log("No workflow runs found.");
      return;
    }

    // Summary line
    const active = (statusCounts["implementing"] ?? 0) + (statusCounts["auto_review_fix_loop"] ?? 0);
    const waiting = (statusCounts["plan_draft"] ?? 0) + (statusCounts["plan_revision"] ?? 0) + (statusCounts["awaiting_human_review"] ?? 0);
    const done = statusCounts["done"] ?? 0;
    const failed = (statusCounts["failed"] ?? 0) + (statusCounts["escalated"] ?? 0);

    console.log(`\n  ${totalCount} runs: ${active} active, ${waiting} waiting, ${done} done, ${failed} failed`);
    console.log(`  ${"─".repeat(70)}`);

    for (const { status, runs } of allRuns) {
      console.log(`\n  [${status}] (${runs.length})`);
      for (const run of runs) {
        const title = (run.metadata as Record<string, unknown>)?.title ?? "";
        const age = formatCliDuration(run.createdAt, null);
        const titleStr = title ? `  ${String(title).slice(0, 35)}` : "";
        console.log(
          `    ${run.id.slice(0, 8)}  #${String(run.issueNumber).padEnd(5)} ${run.repo.padEnd(25)} ${age.padStart(6)}${titleStr}`,
        );
      }
    }
    console.log();
  } finally {
    store.close();
  }
}
