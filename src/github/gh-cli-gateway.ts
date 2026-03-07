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

interface ApiIssue {
  number: number;
  title: string;
  body: string | null;
  labels: { name: string }[];
  html_url: string;
  state: string;
  user: { login: string };
  created_at: string;
}

interface ApiComment {
  id: number;
  user: { login: string };
  body: string;
  created_at: string;
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
    // Use REST API to avoid GraphQL Projects Classic deprecation errors
    const raw = gh(["api", `repos/${repo}/issues/${number}`]);
    const issue = parseJSON<ApiIssue>(raw);
    const commentsRaw = gh(["api", `repos/${repo}/issues/${number}/comments`]);
    const comments = parseJSON<ApiComment[]>(commentsRaw);
    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      labels: issue.labels.map((l: { name: string }) => l.name),
      url: issue.html_url,
      state: issue.state as "open" | "closed",
      author: issue.user.login,
      createdAt: issue.created_at,
      comments: comments.map((c) => ({
        id: c.id,
        author: c.user.login,
        body: c.body,
        createdAt: c.created_at,
      })),
    };
  }

  async fetchEligibleIssues(
    repo: string,
    labels: string[],
  ): Promise<GitHubIssue[]> {
    const labelParam = labels.join(",");
    const raw = gh([
      "api", `repos/${repo}/issues`,
      "-f", "state=open",
      "-f", `labels=${labelParam}`,
      "-f", "per_page=50",
    ]);
    const issues = parseJSON<ApiIssue[]>(raw);
    return issues.map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      labels: issue.labels.map((l: { name: string }) => l.name),
      url: issue.html_url,
      state: issue.state as "open" | "closed",
      author: issue.user.login,
      createdAt: issue.created_at,
      comments: [],
    }));
  }

  async addComment(
    repo: string,
    issueNumber: number,
    body: string,
  ): Promise<void> {
    gh(["api", `repos/${repo}/issues/${issueNumber}/comments`, "-f", `body=${body}`]);
  }

  async addLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    execFileSync("gh", ["api", `repos/${repo}/issues/${issueNumber}/labels`, "--input", "-"], {
      encoding: "utf-8",
      input: JSON.stringify({ labels }),
    });
  }

  async removeLabels(
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    for (const label of labels) {
      try {
        gh(["api", `repos/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, "-X", "DELETE"]);
      } catch {
        // Label may not exist on issue
      }
    }
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
