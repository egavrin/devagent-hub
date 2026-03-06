#!/usr/bin/env bun

import {
  runCommand,
  triageCommand,
  statusCommand,
  listCommand,
} from "./commands.js";

const [command, ...args] = process.argv.slice(2);

if (!command || command === "help") {
  console.log(`devagent-hub - GitHub-first workflow orchestrator for DevAgent

Commands:
  run <issue-number>    Run full workflow for a GitHub issue
  triage <issue-number> Run triage phase only
  status <run-id>       Show workflow run status
  list                  List workflow runs
  help                  Show this help

Options:
  --repo <owner/repo>   GitHub repository (default: from git remote)
`);
  process.exit(0);
}

switch (command) {
  case "run":
    await runCommand(args);
    break;
  case "triage":
    await triageCommand(args);
    break;
  case "status":
    statusCommand(args);
    break;
  case "list":
    listCommand();
    break;
  default:
    console.error(`Unknown command: ${command}\nRun 'devagent-hub help' for usage.`);
    process.exit(1);
}
