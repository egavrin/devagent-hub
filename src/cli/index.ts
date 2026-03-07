#!/usr/bin/env bun

import {
  runCommand,
  triageCommand,
  statusCommand,
  listCommand,
  uiCommand,
  approveCommand,
  reworkCommand,
  resumeCommand,
  resolveCommentsCommand,
  fixCICommand,
  artifactsCommand,
} from "./commands.js";

const [command, ...args] = process.argv.slice(2);

if (command === "help") {
  console.log(`devagent-hub - GitHub-first workflow orchestrator for DevAgent

Commands:
  (default)             Launch interactive TUI dashboard
  run <issue-number>    Run full workflow for a GitHub issue [--mode assisted|watch]
  triage <issue-number> Run triage phase only
  approve <run-id>      Approve plan and proceed to implementation
  rework <run-id>       Send plan back for revision (--note "...")
  resume <run-id>       Resume a paused/failed run from current status
  resolve-comments <n>  Resolve PR review comments for issue #n
  fix-ci <n>            Fix CI failures for issue #n [--ready]
  status <run-id>       Show workflow run details [--json]
  artifacts <run-id>    Show artifacts for a workflow run
  list                  List workflow runs [--json]
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
  case "approve":
    await approveCommand(args);
    break;
  case "rework":
    await reworkCommand(args);
    break;
  case "resume":
    await resumeCommand(args);
    break;
  case "resolve-comments":
    await resolveCommentsCommand(args);
    break;
  case "fix-ci":
    await fixCICommand(args);
    break;
  case "status":
    statusCommand(args);
    break;
  case "artifacts":
    artifactsCommand(args);
    break;
  case "list":
    listCommand(args);
    break;
  default:
    await uiCommand(command ? [command, ...args] : args);
    break;
}
