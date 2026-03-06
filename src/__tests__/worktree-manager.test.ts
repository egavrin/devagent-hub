import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { WorktreeManager } from "../workspace/worktree-manager.js";

describe("WorktreeManager", () => {
  let repoDir: string;
  let workspaceDir: string;
  let manager: WorktreeManager;

  beforeEach(() => {
    // Create a temp directory with a real git repo
    repoDir = mkdtempSync(join(tmpdir(), "wt-test-repo-"));
    workspaceDir = mkdtempSync(join(tmpdir(), "wt-test-ws-"));

    execFileSync("git", ["init", "-b", "main"], {
      cwd: repoDir,
      stdio: "pipe",
    });
    execFileSync(
      "git",
      ["commit", "--allow-empty", "-m", "init"],
      { cwd: repoDir, stdio: "pipe" },
    );

    manager = new WorktreeManager(repoDir, workspaceDir);
  });

  afterEach(() => {
    // Clean up any worktrees first, then remove temp dirs
    try {
      const worktrees = manager.list(repoDir);
      for (const wt of worktrees) {
        manager.remove(
          parseInt(wt.branch.replace("da/issue-", ""), 10),
          repoDir,
          true,
        );
      }
    } catch {
      // best-effort cleanup
    }

    rmSync(repoDir, { recursive: true, force: true });
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  it("creates a worktree for an issue", () => {
    const info = manager.create(42, repoDir);

    expect(info.branch).toBe("da/issue-42");
    expect(info.path).toBe(join(workspaceDir, "issue-42"));
    expect(info.repoRoot).toBe(repoDir);

    // The worktree directory should exist and be a git checkout
    const headRef = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: info.path,
      encoding: "utf-8",
    }).trim();
    expect(headRef).toBeTruthy();
  });

  it("returns existing worktree if already created", () => {
    const first = manager.create(99, repoDir);
    const second = manager.create(99, repoDir);

    expect(second.path).toBe(first.path);
    expect(second.branch).toBe(first.branch);
  });

  it("lists managed worktrees", () => {
    manager.create(1, repoDir);
    manager.create(2, repoDir);

    const listed = manager.list(repoDir);
    const branches = listed.map((w) => w.branch).sort();

    expect(branches).toEqual(["da/issue-1", "da/issue-2"]);
  });

  it("removes a worktree", () => {
    manager.create(7, repoDir);
    expect(manager.list(repoDir)).toHaveLength(1);

    manager.remove(7, repoDir, true);

    expect(manager.list(repoDir)).toHaveLength(0);
  });
});
