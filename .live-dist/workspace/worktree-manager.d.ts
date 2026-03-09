export interface WorktreeInfo {
    path: string;
    branch: string;
    repoRoot: string;
}
export declare class WorktreeManager {
    private baseDir;
    constructor(repoRoot: string, workspaceRoot?: string);
    /** Resolve symlinks in baseDir (e.g. macOS /var -> /private/var). */
    private resolvedBaseDir;
    /**
     * Create a worktree for a given issue number and run.
     * Branch: da/issue-<number>/run-<runId>, path: <baseDir>/issue-<number>-run-<runId>.
     * If runId is omitted, falls back to da/issue-<number> (legacy behavior).
     * If the worktree already exists, returns its info without recreating.
     */
    create(issueNumber: number, repoRoot: string, baseBranch?: string, runId?: string): WorktreeInfo;
    /**
     * Force-remove a worktree for a given issue number (and optional run).
     * Optionally deletes the branch as well.
     */
    remove(issueNumber: number, repoRoot: string, deleteBranch?: boolean, runId?: string): void;
    /**
     * List all managed worktrees (those living under baseDir).
     * Parses `git worktree list --porcelain`.
     */
    list(repoRoot: string): WorktreeInfo[];
}
