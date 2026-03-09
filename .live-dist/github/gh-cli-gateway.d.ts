import type { GitHubGateway } from "./gateway.js";
import type { GitHubIssue, GitHubComment, GitHubPR, GitHubCheck, CreatePRParams } from "./types.js";
export declare class GhCliGateway implements GitHubGateway {
    fetchIssue(repo: string, number: number): Promise<GitHubIssue>;
    fetchEligibleIssues(repo: string, labels: string[]): Promise<GitHubIssue[]>;
    addComment(repo: string, issueNumber: number, body: string): Promise<void>;
    addLabels(repo: string, issueNumber: number, labels: string[]): Promise<void>;
    removeLabels(repo: string, issueNumber: number, labels: string[]): Promise<void>;
    createPR(repo: string, params: CreatePRParams): Promise<GitHubPR>;
    fetchPR(repo: string, number: number): Promise<GitHubPR>;
    fetchPRChecks(repo: string, prNumber: number): Promise<GitHubCheck[]>;
    fetchPRReviewComments(repo: string, prNumber: number): Promise<GitHubComment[]>;
    resolveReviewThreads(repo: string, prNumber: number, commentNodeIds: string[]): Promise<void>;
    checkBranchConflicts(repoPath: string, _branch: string, base: string): Promise<{
        conflicted: boolean;
        conflictFiles: string[];
    }>;
    pushBranch(repoPath: string, branch: string, commitMessage?: string): Promise<void>;
    markPRReady(repo: string, prNumber: number): Promise<void>;
    createIssue(repo: string, params: {
        title: string;
        body: string;
        labels?: string[];
    }): Promise<{
        number: number;
        url: string;
    }>;
    fetchCIFailureLogs(repo: string, prNumber: number): Promise<{
        check: string;
        log: string;
    }[]>;
}
