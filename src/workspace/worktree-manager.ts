import { execFileSync } from "child_process";
import { existsSync, mkdirSync, realpathSync } from "fs";
import { join, resolve } from "path";

export interface WorktreeInfo {
  path: string;
  branch: string;
  repoRoot: string;
}

export class WorktreeManager {
  private baseDir: string;

  constructor(repoRoot: string, workspaceRoot?: string) {
    this.baseDir = resolve(
      workspaceRoot ?? join(repoRoot, ".devagent", "workspaces"),
    );
  }

  /** Resolve symlinks in baseDir (e.g. macOS /var -> /private/var). */
  private resolvedBaseDir(): string {
    return existsSync(this.baseDir) ? realpathSync(this.baseDir) : this.baseDir;
  }

  /**
   * Create a worktree for a given issue number.
   * Branch: da/issue-<number>, path: <baseDir>/issue-<number>.
   * If the worktree already exists, returns its info without recreating.
   */
  create(
    issueNumber: number,
    repoRoot: string,
    baseBranch = "main",
  ): WorktreeInfo {
    const branch = `da/issue-${issueNumber}`;
    const worktreePath = join(this.baseDir, `issue-${issueNumber}`);

    // If the worktree directory already exists, return existing info
    if (existsSync(worktreePath)) {
      return { path: worktreePath, branch, repoRoot };
    }

    // Ensure base directory exists
    mkdirSync(this.baseDir, { recursive: true });

    // Create the branch from baseBranch (ignore error if it already exists)
    try {
      execFileSync("git", ["branch", branch, baseBranch], {
        cwd: repoRoot,
        stdio: "pipe",
      });
    } catch {
      // Branch may already exist — that is fine
    }

    // Add the worktree
    execFileSync("git", ["worktree", "add", worktreePath, branch], {
      cwd: repoRoot,
      stdio: "pipe",
    });

    return { path: worktreePath, branch, repoRoot };
  }

  /**
   * Force-remove a worktree for a given issue number.
   * Optionally deletes the branch as well.
   */
  remove(
    issueNumber: number,
    repoRoot: string,
    deleteBranch = false,
  ): void {
    const worktreePath = join(this.baseDir, `issue-${issueNumber}`);
    const branch = `da/issue-${issueNumber}`;

    // Force-remove the worktree
    try {
      execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
        cwd: repoRoot,
        stdio: "pipe",
      });
    } catch {
      // Worktree may not exist — ignore
    }

    if (deleteBranch) {
      try {
        execFileSync("git", ["branch", "-D", branch], {
          cwd: repoRoot,
          stdio: "pipe",
        });
      } catch {
        // Branch may not exist — ignore
      }
    }
  }

  /**
   * List all managed worktrees (those living under baseDir).
   * Parses `git worktree list --porcelain`.
   */
  list(repoRoot: string): WorktreeInfo[] {
    const output = execFileSync(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd: repoRoot, encoding: "utf-8" },
    );

    const resolved = this.resolvedBaseDir();
    const results: WorktreeInfo[] = [];
    const blocks = output.split("\n\n").filter(Boolean);

    for (const block of blocks) {
      const lines = block.split("\n");
      let path = "";
      let branch = "";

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          path = line.slice("worktree ".length);
        } else if (line.startsWith("branch ")) {
          // branch refs/heads/da/issue-42 -> da/issue-42
          branch = line.slice("branch ".length).replace("refs/heads/", "");
        }
      }

      // Only include worktrees that live under our managed baseDir
      if (path && path.startsWith(resolved)) {
        results.push({ path, branch, repoRoot });
      }
    }

    return results;
  }
}
