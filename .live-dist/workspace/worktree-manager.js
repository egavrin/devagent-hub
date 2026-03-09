import { execFileSync } from "child_process";
import { existsSync, mkdirSync, realpathSync } from "fs";
import { join, resolve } from "path";
export class WorktreeManager {
    baseDir;
    constructor(repoRoot, workspaceRoot) {
        this.baseDir = resolve(workspaceRoot ?? join(repoRoot, ".devagent", "workspaces"));
    }
    /** Resolve symlinks in baseDir (e.g. macOS /var -> /private/var). */
    resolvedBaseDir() {
        return existsSync(this.baseDir) ? realpathSync(this.baseDir) : this.baseDir;
    }
    /**
     * Create a worktree for a given issue number and run.
     * Branch: da/issue-<number>/run-<runId>, path: <baseDir>/issue-<number>-run-<runId>.
     * If runId is omitted, falls back to da/issue-<number> (legacy behavior).
     * If the worktree already exists, returns its info without recreating.
     */
    create(issueNumber, repoRoot, baseBranch = "main", runId) {
        const runSuffix = runId ? runId.slice(0, 8) : "";
        const branch = runSuffix
            ? `da/issue-${issueNumber}/run-${runSuffix}`
            : `da/issue-${issueNumber}`;
        const worktreePath = runSuffix
            ? join(this.baseDir, `issue-${issueNumber}-run-${runSuffix}`)
            : join(this.baseDir, `issue-${issueNumber}`);
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
        }
        catch {
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
     * Force-remove a worktree for a given issue number (and optional run).
     * Optionally deletes the branch as well.
     */
    remove(issueNumber, repoRoot, deleteBranch = false, runId) {
        const runSuffix = runId ? runId.slice(0, 8) : "";
        const worktreePath = runSuffix
            ? join(this.baseDir, `issue-${issueNumber}-run-${runSuffix}`)
            : join(this.baseDir, `issue-${issueNumber}`);
        const branch = runSuffix
            ? `da/issue-${issueNumber}/run-${runSuffix}`
            : `da/issue-${issueNumber}`;
        // Force-remove the worktree
        try {
            execFileSync("git", ["worktree", "remove", "--force", worktreePath], {
                cwd: repoRoot,
                stdio: "pipe",
            });
        }
        catch {
            // Worktree may not exist — ignore
        }
        if (deleteBranch) {
            try {
                execFileSync("git", ["branch", "-D", branch], {
                    cwd: repoRoot,
                    stdio: "pipe",
                });
            }
            catch {
                // Branch may not exist — ignore
            }
        }
    }
    /**
     * List all managed worktrees (those living under baseDir).
     * Parses `git worktree list --porcelain`.
     */
    list(repoRoot) {
        const output = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: repoRoot, encoding: "utf-8" });
        const resolved = this.resolvedBaseDir();
        const results = [];
        const blocks = output.split("\n\n").filter(Boolean);
        for (const block of blocks) {
            const lines = block.split("\n");
            let path = "";
            let branch = "";
            for (const line of lines) {
                if (line.startsWith("worktree ")) {
                    path = line.slice("worktree ".length);
                }
                else if (line.startsWith("branch ")) {
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
