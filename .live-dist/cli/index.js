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
function ensureConfigDir() {
    mkdirSync(CONFIG_DIR, { recursive: true });
}
function detectRepoRoot() {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
        encoding: "utf-8",
    }).trim();
}
function detectRepoFullName() {
    const raw = execFileSync("gh", ["repo", "view", "--json", "nameWithOwner"], {
        encoding: "utf-8",
    });
    return JSON.parse(raw).nameWithOwner;
}
function argValue(args, flag) {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
}
function createService() {
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
        service: new WorkflowService(store, new GhCliGateway(), new LocalRunnerClient(), project, config),
    };
}
function printHelp() {
    console.log(`devagent-hub

Commands:
  project add
  issue sync
  run start --issue <number>
  run resume <id>
  run cancel <id>
  pr open <id>
  list
  status <id>
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
    }
    finally {
        store.close();
    }
    process.exit(0);
}
if (command === "issue" && subcommand === "sync") {
    const { store, service } = createService();
    try {
        const items = await service.syncIssues();
        console.log(JSON.stringify(items, null, 2));
    }
    finally {
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
    }
    finally {
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
    }
    finally {
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
    }
    finally {
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
    }
    finally {
        store.close();
    }
    process.exit(0);
}
if (command === "list") {
    const { store, service } = createService();
    try {
        console.log(JSON.stringify(service.listWorkflows(), null, 2));
    }
    finally {
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
    }
    finally {
        store.close();
    }
    process.exit(0);
}
throw new Error(`Unknown command: ${[command, subcommand].filter(Boolean).join(" ")}`);
