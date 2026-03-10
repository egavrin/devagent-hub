#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { loadBaselineManifest, resolveHubRoot } from "../src/baseline/manifest.js";
import { buildBootstrapPlan, formatBootstrapSummary } from "../src/bootstrap/local.js";

function argValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function run(command: string[], cwd: string): void {
  execFileSync(command[0]!, command.slice(1), {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
}

const args = process.argv.slice(2);
const hubRoot = resolveHubRoot();
const workspaceRoot = resolve(argValue(args, "--workspace-root") ?? resolve(hubRoot, ".."));
const manifest = loadBaselineManifest(hubRoot);
const plan = buildBootstrapPlan(hubRoot, workspaceRoot, manifest);

for (const repo of plan.repos) {
  if (!repo.missing) {
    continue;
  }
  run(["git", "clone", repo.url, repo.path], workspaceRoot);
}

for (const action of plan.actions) {
  console.log(`==> ${action.label}`);
  run(action.command, action.cwd);
}

console.log(formatBootstrapSummary(plan));
