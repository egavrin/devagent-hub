import { execFileSync } from "node:child_process";
import type { GitHubGateway } from "./gateway.js";
import type {
  GitHubIssue,
  GitHubComment,
  GitHubPR,
  GitHubCheck,
  CreatePRParams,
} from "./types.js";

function gh(args: string[], repo?: string): string {
  const fullArgs = repo ? ["-R", repo, ...args] : args;
  return execFileSync("gh", fullArgs, { encoding: "utf-8" });
}

function parseJSON<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

interface GhIssue {
  number: number;
  title: string;
  body: string;
  labels: { name: string }[];
  url: string;
  state: string;
  author: { login: string };
  createdAt: string;
  comments: GhComment[];
}

interface GhComment {
  id: number;
  author: { login: string };
  body: string;
  createdAt: string;
}

interface GhPR {
  number: number;
  title: string;
  body: string;
  url: string;
  state: string;
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
}

interface GhCheck {
  name: string;
  status: string;
  conclusion: string;
}

function mapComment(c: GhComment): GitHubComment {
  return {
    id: c.id,
    author: c.author.login,
    body: c.body,
    createdAt: c.createdAt,
  };
}

function mapIssue(raw: GhIssue): GitHubIssue {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body,
    labels: raw.labels.map((l) => l.name),
    url: raw.url,
    state: raw.state.toLowerCase() as "open" | "closed",
    author: raw.author.login,
    createdAt: raw.createdAt,
    comments: (raw.comments ?? []).map(mapComment),
  };
}

function mapPRState(state: string): "open" | "closed" | "merged" {
  const s = state.toLowerCase();
  if (s === "merged") return "merged";
  if (s === "closed") return "closed";
  return "open";
}

function mapCheck(c: GhCheck): GitHubCheck {
  return {
    name: c.name,
    status: c.status.toLowerCase() as GitHubCheck["status"],
    conclusion: c.conclusion
      ? (c.conclusion.toLowerCase() as GitHubCheck["conclusion"])
      : null,
  };
}

export class GhCliGateway implements GitHubGateway {
  async fetchIssue(repo: string, number: number): Promise<GitHubIssue> {
    const raw = gh(
      [
        "issue",
        "view",
        String(number),
        "--json",
        "number,title,body,labels,url,state,author,createdAt,comments",
      ],
      repo,
    );
    return mapIssue(parseJSON<GhIssue>(raw));
  }

  async fetchEligibleIssues(
    repo: string,
    labels: string[],
  ): Promise<GitHubIssue[]> {
    const raw = gh(
      [
        "issue",
        "list",
        "--state",
        "open",
        "--label",
        labels.join(","),
        "--json",
        "number,title,body,labels,url,state,author,createdAt,comments",
        "--limit",
        "50",
      ],
      repo,
    );
    return parseJSON<GhIssue[]>(raw).map(mapIssue);
  }

  async addComment(
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<void> {
    gh(["issue", "comment", String(issueNumber), "--body", body], repo);
  }

  async addLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    gh(
      ["issue", "edit", String(issueNumber), "--add-label", labels.join(",")],
      repo,
    );
  }

  async removeLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    gh(
      [
        "issue",
        "edit",
        String(issueNumber),
        "--remove-label",
        labels.join(","),
      ],
      repo,
    );
  }

  async createPR(repo: string, params: CreatePRParams): Promise<GitHubPR> {
    const args = [
      "pr",
      "create",
      "--title",
      params.title,
      "--body",
      params.body,
      "--head",
      params.head,
      "--base",
      params.base,
    ];
    if (params.draft) {
      args.push("--draft");
    }
    // Create returns the PR URL; fetch it afterwards for full data
    gh(args, repo);
    // Find the PR by head branch
    const raw = gh(
      [
        "pr",
        "view",
        params.head,
        "--json",
        "number,title,body,url,state,isDraft,headRefName,baseRefName",
      ],
      repo,
    );
    const pr = parseJSON<GhPR>(raw);
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      url: pr.url,
      state: mapPRState(pr.state),
      draft: pr.isDraft,
      head: pr.headRefName,
      base: pr.baseRefName,
      checks: [],
      reviewComments: [],
    };
  }

  async fetchPR(repo: string, number: number): Promise<GitHubPR> {
    const raw = gh(
      [
        "pr",
        "view",
        String(number),
        "--json",
        "number,title,body,url,state,isDraft,headRefName,baseRefName",
      ],
      repo,
    );
    const pr = parseJSON<GhPR>(raw);
    const [checks, reviewComments] = await Promise.all([
      this.fetchPRChecks(repo, number),
      this.fetchPRReviewComments(repo, number),
    ]);
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      url: pr.url,
      state: mapPRState(pr.state),
      draft: pr.isDraft,
      head: pr.headRefName,
      base: pr.baseRefName,
      checks,
      reviewComments,
    };
  }

  async fetchPRChecks(
    repo: string,
    prNumber: number,
  ): Promise<GitHubCheck[]> {
    const raw = gh(
      [
        "pr",
        "checks",
        String(prNumber),
        "--json",
        "name,status,conclusion",
      ],
      repo,
    );
    return parseJSON<GhCheck[]>(raw).map(mapCheck);
  }

  async fetchPRReviewComments(
    repo: string,
    prNumber: number,
  ): Promise<GitHubComment[]> {
    const raw = gh(
      [
        "api",
        `repos/${repo}/pulls/${prNumber}/comments`,
        "--jq",
        ".",
      ],
    );
    interface ApiComment {
      id: number;
      user: { login: string };
      body: string;
      created_at: string;
    }
    return parseJSON<ApiComment[]>(raw).map((c) => ({
      id: c.id,
      author: c.user.login,
      body: c.body,
      createdAt: c.created_at,
    }));
  }

  async pushBranch(repoPath: string, branch: string): Promise<void> {
    execFileSync("git", ["push", "origin", branch], {
      cwd: repoPath,
      encoding: "utf-8",
    });
  }
}
