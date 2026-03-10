#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CanonicalStore } from "../persistence/canonical-store.js";
import { GhCliGateway } from "../github/gh-cli-gateway.js";
import { loadWorkflowConfig } from "../workflow/config.js";
import { LocalRunnerClient } from "../runner-client/local-runner-client.js";
import { WorkflowService } from "../workflows/service.js";

const CONFIG_DIR = join(homedir(), ".config", "devagent-hub");
const DB_PATH = join(CONFIG_DIR, "state.db");

function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

function detectRepoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf-8",
  }).trim();
}

function detectRepoFullName(): string {
  try {
    const remoteUrl = execFileSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf-8",
    }).trim();
    const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/);
    if (httpsMatch?.[1]) {
      return httpsMatch[1];
    }
  } catch {
    // Fall back to gh CLI when origin is unavailable or unparsable.
  }

  const raw = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner"], {
    encoding: "utf-8",
  });
  return (JSON.parse(raw) as { nameWithOwner: string }).nameWithOwner;
}

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function createService(): { store: CanonicalStore; service: WorkflowService } {
  ensureConfigDir();
  const repoRoot = detectRepoRoot();
  const repoFullName = detectRepoFullName();
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
    service: new WorkflowService(
      store,
      new GhCliGateway(),
      new LocalRunnerClient(),
      project,
      config,
    ),
  };
}

function printHelp(): void {
  console.log(`devagent-hub

Commands:
  project add
  issue sync
  run start --issue <number>
  run resume <id>
  run reject <id> --note <text>
  run cancel <id>
  pr open <id>
  pr repair <id>
  list
  status <id>
  tui [--screen inbox|runs|detail|settings] [--workflow <id>]
  help
`);
}

const [command, subcommand, ...args] = process.argv.slice(2);

if (!command || command === "help") {
  printHelp();
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

if (command === "run" && subcommand === "start") {
  const issueNumber = argValue(args, "--issue");
  if (!issueNumber) {
    throw new Error("Usage: devagent-hub run start --issue <number>");
  }
  const { store, service } = createService();
  try {
    const workflow = await service.start(issueNumber);
    console.log(JSON.stringify(workflow, null, 2));
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
  const { store, service } = createService();
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
  const { store, service } = createService();
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
  const { store, service } = createService();
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
  const { store, service } = createService();
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
  const { store, service } = createService();
  try {
    const workflow = await service.repairPr(workflowId);
    console.log(JSON.stringify(workflow, null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "list") {
  const { store, service } = createService();
  try {
    console.log(JSON.stringify(service.listWorkflows(), null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "status") {
  const workflowId = subcommand;
  if (!workflowId) {
    throw new Error("Usage: devagent-hub status <id>");
  }
  const { store, service } = createService();
  try {
    console.log(JSON.stringify(service.getSnapshot(workflowId), null, 2));
  } finally {
    store.close();
  }
  process.exit(0);
}

if (command === "tui") {
  const screen = (argValue(args, "--screen") ?? "runs") as "inbox" | "runs" | "detail" | "settings";
  const workflowId = argValue(args, "--workflow");
  const { store } = createService();
  const { renderTui } = await import("../tui/index.js");
  await renderTui(store, screen, workflowId).waitUntilExit();
  store.close();
  process.exit(0);
}

throw new Error(`Unknown command: ${[command, subcommand].filter(Boolean).join(" ")}`);
