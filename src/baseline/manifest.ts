import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BaselineSystemSnapshot } from "../canonical/types.js";

export type BaselineRepoName = "devagent-sdk" | "devagent-runner" | "devagent" | "devagent-hub";

export type BaselineRepoManifest = {
  name: BaselineRepoName;
  url: string;
  branch: "main";
  sha: string;
};

export type BaselineManifest = {
  protocolVersion: string;
  repos: Record<BaselineRepoName, BaselineRepoManifest>;
};

export type BaselineRepoStatus = {
  name: BaselineRepoName;
  path: string;
  headSha: string;
  clean: boolean;
};

export function resolveHubRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

export function resolveWorkspaceRoot(hubRoot = resolveHubRoot()): string {
  return resolve(hubRoot, "..");
}

export function baselineManifestPath(hubRoot = resolveHubRoot()): string {
  return join(hubRoot, "baseline.json");
}

export function loadBaselineManifest(hubRoot = resolveHubRoot()): BaselineManifest {
  return JSON.parse(readFileSync(baselineManifestPath(hubRoot), "utf-8")) as BaselineManifest;
}

export function resolveBaselineRepoPath(
  repoName: BaselineRepoName,
  workspaceRoot = resolveWorkspaceRoot(),
): string {
  return join(workspaceRoot, repoName);
}

export function gitStdout(repoPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoPath,
    encoding: "utf-8",
  }).trim();
}

export function readRepoHead(repoPath: string): string {
  return gitStdout(repoPath, ["rev-parse", "HEAD"]);
}

export function readBranchHead(repoPath: string, branch: string): string {
  return gitStdout(repoPath, ["rev-parse", branch]);
}

export function branchExists(repoPath: string, branch: string): boolean {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
      cwd: repoPath,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function isRepoClean(repoPath: string): boolean {
  return gitStdout(repoPath, ["status", "--short"]) === "";
}

export function readBaselineRepoStatuses(
  manifest = loadBaselineManifest(),
  workspaceRoot = resolveWorkspaceRoot(),
): BaselineRepoStatus[] {
  return (Object.values(manifest.repos) as BaselineRepoManifest[]).map((repo) => {
    const path = resolveBaselineRepoPath(repo.name, workspaceRoot);
    return {
      name: repo.name,
      path,
      headSha: readRepoHead(path),
      clean: isRepoClean(path),
    };
  });
}

export function readCurrentBaselineSystemSnapshot(
  manifest = loadBaselineManifest(),
  workspaceRoot = resolveWorkspaceRoot(),
): BaselineSystemSnapshot {
  const statuses = readBaselineRepoStatuses(manifest, workspaceRoot);
  const lookup = new Map(statuses.map((status) => [status.name, status]));
  return {
    protocolVersion: manifest.protocolVersion,
    sdkSha: lookup.get("devagent-sdk")!.headSha,
    runnerSha: lookup.get("devagent-runner")!.headSha,
    devagentSha: lookup.get("devagent")!.headSha,
    hubSha: lookup.get("devagent-hub")!.headSha,
  };
}
