import type {
  GitHubIssue,
  GitHubComment,
  GitHubPR,
  GitHubCheck,
  CreatePRParams,
} from "./types.js";

export interface GitHubGateway {
  fetchIssue(repo: string, number: number): Promise<GitHubIssue>;
  fetchEligibleIssues(repo: string, labels: string[]): Promise<GitHubIssue[]>;
  addComment(repo: string, issueNumber: number, body: string): Promise<void>;
  addLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void>;
  removeLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void>;
  createPR(repo: string, params: CreatePRParams): Promise<GitHubPR>;
  fetchPR(repo: string, number: number): Promise<GitHubPR>;
  fetchPRChecks(repo: string, prNumber: number): Promise<GitHubCheck[]>;
  fetchPRReviewComments(
    repo: string,
    prNumber: number,
  ): Promise<GitHubComment[]>;
  pushBranch(repoPath: string, branch: string): Promise<void>;
}
