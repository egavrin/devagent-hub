import type { GitHubGateway } from "./gateway.js";
import type {
  GitHubIssue,
  GitHubComment,
  GitHubPR,
  GitHubCheck,
  CreatePRParams,
} from "./types.js";

export class MockGitHubGateway implements GitHubGateway {
  issues = new Map<string, GitHubIssue>();
  prs = new Map<string, GitHubPR>();
  pushedBranches: { repoPath: string; branch: string }[] = [];

  private nextCommentId = 1;
  private nextPRNumber = 100;

  private issueKey(repo: string, number: number): string {
    return `${repo}#${number}`;
  }

  /** Seed an issue into the mock store. */
  seedIssue(repo: string, issue: GitHubIssue): void {
    this.issues.set(this.issueKey(repo, issue.number), issue);
  }

  /** Seed a PR into the mock store. */
  seedPR(repo: string, pr: GitHubPR): void {
    this.prs.set(this.issueKey(repo, pr.number), pr);
  }

  async fetchIssue(repo: string, number: number): Promise<GitHubIssue> {
    const issue = this.issues.get(this.issueKey(repo, number));
    if (!issue) {
      throw new Error(`Issue ${repo}#${number} not found`);
    }
    return issue;
  }

  async fetchEligibleIssues(
    repo: string,
    labels: string[],
  ): Promise<GitHubIssue[]> {
    const results: GitHubIssue[] = [];
    for (const [key, issue] of this.issues) {
      if (!key.startsWith(`${repo}#`)) continue;
      if (issue.state !== "open") continue;
      if (labels.some((l) => issue.labels.includes(l))) {
        results.push(issue);
      }
    }
    return results;
  }

  async addComment(
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<void> {
    const issue = await this.fetchIssue(repo, issueNumber);
    const comment: GitHubComment = {
      id: this.nextCommentId++,
      author: "mock-bot",
      body,
      createdAt: new Date().toISOString(),
    };
    issue.comments.push(comment);
  }

  async addLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    const issue = await this.fetchIssue(repo, issueNumber);
    for (const label of labels) {
      if (!issue.labels.includes(label)) {
        issue.labels.push(label);
      }
    }
  }

  async removeLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    const issue = await this.fetchIssue(repo, issueNumber);
    issue.labels = issue.labels.filter((l) => !labels.includes(l));
  }

  async createPR(repo: string, params: CreatePRParams): Promise<GitHubPR> {
    const number = this.nextPRNumber++;
    const pr: GitHubPR = {
      number,
      title: params.title,
      body: params.body,
      url: `https://github.com/${repo}/pull/${number}`,
      state: "open",
      draft: params.draft,
      head: params.head,
      base: params.base,
      checks: [],
      reviewComments: [],
    };
    this.prs.set(this.issueKey(repo, number), pr);
    return pr;
  }

  async fetchPR(repo: string, number: number): Promise<GitHubPR> {
    const pr = this.prs.get(this.issueKey(repo, number));
    if (!pr) {
      throw new Error(`PR ${repo}#${number} not found`);
    }
    return pr;
  }

  async fetchPRChecks(
    repo: string,
    prNumber: number,
  ): Promise<GitHubCheck[]> {
    const pr = await this.fetchPR(repo, prNumber);
    return pr.checks;
  }

  async fetchPRReviewComments(
    repo: string,
    prNumber: number,
  ): Promise<GitHubComment[]> {
    const pr = await this.fetchPR(repo, prNumber);
    return pr.reviewComments;
  }

  async pushBranch(repoPath: string, branch: string): Promise<void> {
    this.pushedBranches.push({ repoPath, branch });
  }
}
