import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  resolveWorkspaceRoot as resolveCanonicalWorkspaceRoot,
  type BaselineManifest,
  type BaselineRepoName,
} from "../baseline/manifest.js";

export type BootstrapAction = {
  cwd: string;
  command: string[];
  label: string;
};

export type BootstrapPlan = {
  workspaceRoot: string;
  repos: Array<{
    name: BaselineRepoName;
    path: string;
    url: string;
    branch: string;
    missing: boolean;
  }>;
  actions: BootstrapAction[];
  readyCommands: string[];
};

const ORDER: BaselineRepoName[] = [
  "devagent-sdk",
  "devagent-runner",
  "devagent",
  "devagent-hub",
];

export function buildBootstrapPlan(
  hubRoot: string,
  workspaceRoot: string,
  manifest: BaselineManifest,
): BootstrapPlan {
  const resolvedHubRoot = resolve(hubRoot);
  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const expectedWorkspaceRoot = resolveCanonicalWorkspaceRoot(resolvedHubRoot);

  if (resolvedWorkspaceRoot !== expectedWorkspaceRoot) {
    throw new Error(
      `Expected workspace root ${expectedWorkspaceRoot} for hub root ${resolvedHubRoot}, got ${resolvedWorkspaceRoot}`,
    );
  }

  const repos = ORDER.map((name) => {
    const repo = manifest.repos[name];
    const path = join(resolvedWorkspaceRoot, name);
    return {
      name,
      path,
      url: repo.url,
      branch: repo.branch,
      missing: !existsSync(path),
    };
  });

  const actions: BootstrapAction[] = [];
  for (const repo of repos) {
    actions.push(
      { cwd: repo.path, command: ["git", "fetch", "origin"], label: `${repo.name}: fetch origin` },
      { cwd: repo.path, command: ["git", "checkout", repo.branch], label: `${repo.name}: checkout ${repo.branch}` },
      { cwd: repo.path, command: ["bun", "install", "--force"], label: `${repo.name}: install dependencies` },
    );

    if (repo.name === "devagent-sdk" || repo.name === "devagent-runner" || repo.name === "devagent" || repo.name === "devagent-hub") {
      actions.push({ cwd: repo.path, command: ["bun", "run", "build"], label: `${repo.name}: build` });
    }

    if (repo.name === "devagent-runner") {
      actions.push({
        cwd: repo.path,
        command: ["bun", "install"],
        label: "devagent-runner: refresh package links after build",
      });
    }

    if (repo.name === "devagent-runner") {
      actions.push({ cwd: join(repo.path, "packages", "cli"), command: ["bun", "link"], label: "devagent-runner: link CLI" });
    }

    if (repo.name === "devagent") {
      actions.push({ cwd: repo.path, command: ["bun", "run", "install-cli"], label: "devagent: link CLI" });
    }

    if (repo.name === "devagent-hub") {
      actions.push({ cwd: repo.path, command: ["bun", "link"], label: "devagent-hub: link CLI" });
    }
  }

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    repos,
    actions,
    readyCommands: ["devagent", "devagent-runner", "devagent-hub"],
  };
}

export function formatBootstrapSummary(plan: BootstrapPlan): string {
  return [
    `Bootstrap complete for ${plan.workspaceRoot}`,
    `Ready commands: ${plan.readyCommands.join(", ")}`,
    "Next steps:",
    "  devagent-hub project add",
    "  devagent-hub issue sync",
    "  devagent-hub run start --issue <number>",
  ].join("\n");
}
