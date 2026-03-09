import type { GitHubGateway } from "./gateway.js";
import type { GitHubIssue, GitHubComment, GitHubPR, GitHubCheck, CreatePRParams } from "./types.js";
export declare class MockGitHubGateway implements GitHubGateway {
    issues: Map<string, GitHubIssue>;
    prs: Map<string, GitHubPR>;
    pushedBranches: {
        repoPath: string;
        branch: string;
    }[];
    private nextCommentId;
    private nextPRNumber;
    private issueKey;
    /** Seed an issue into the mock store. */
    seedIssue(repo: string, issue: GitHubIssue): void;
    /** Seed a PR into the mock store. */
    seedPR(repo: string, pr: GitHubPR): void;
    fetchIssue(repo: string, number: number): Promise<GitHubIssue>;
    fetchEligibleIssues(repo: string, labels: string[]): Promise<GitHubIssue[]>;
    addComment(repo: string, issueNumber: number, body: string): Promise<void>;
    addLabels(repo: string, issueNumber: number, labels: string[]): Promise<void>;
    removeLabels(repo: string, issueNumber: number, labels: string[]): Promise<void>;
    createPR(repo: string, params: CreatePRParams): Promise<GitHubPR>;
    fetchPR(repo: string, number: number): Promise<GitHubPR>;
    fetchPRChecks(repo: string, prNumber: number): Promise<GitHubCheck[]>;
    fetchPRReviewComments(repo: string, prNumber: number): Promise<GitHubComment[]>;
    resolvedThreads: string[];
    conflictResults: Map<string, {
        conflicted: boolean;
        conflictFiles: string[];
    }>;
    resolveReviewThreads(_repo: string, _prNumber: number, commentNodeIds: string[]): Promise<void>;
    checkBranchConflicts(_repoPath: string, branch: string, _base: string): Promise<{
        conflicted: boolean;
        conflictFiles: string[];
    }>;
    readiedPRs: number[];
    ciFailureLogs: {
        check: string;
        log: string;
    }[];
    markPRReady(_repo: string, prNumber: number): Promise<void>;
    fetchCIFailureLogs(_repo: string, _prNumber: number): Promise<{
        check: string;
        log: string;
    }[]>;
    createdIssues: {
        repo: string;
        title: string;
        body: string;
        labels: string[];
        number: number;
        url: string;
    }[];
    private nextIssueNumber;
    createIssue(repo: string, params: {
        title: string;
        body: string;
        labels?: string[];
    }): Promise<{
        number: number;
        url: string;
    }>;
    pushBranch(repoPath: string, branch: string, _commitMessage?: string): Promise<void>;
}
