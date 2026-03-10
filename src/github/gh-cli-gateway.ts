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
      "api", "-X", "GET", `repos/${repo}/issues`,
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
    let raw: string;
    try {
      raw = gh(
        ["pr", "checks", String(prNumber), "--json", "name,state,bucket"],
        repo,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("no checks reported")) return [];
      throw err;
    }
    interface GhCheckV2 { name: string; state: string; bucket: string }
    return parseJSON<GhCheckV2[]>(raw).map((c) => ({
      name: c.name,
      status: c.state?.toLowerCase() === "pending" ? "in_progress" as const : "completed" as const,
      conclusion: c.bucket?.toLowerCase() === "fail" ? "failure" as const
        : c.bucket?.toLowerCase() === "pass" ? "success" as const
        : null,
    }));
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
    interface ApiReviewComment {
      id: number;
      node_id: string;
      user: { login: string };
      body: string;
      created_at: string;
      path?: string;
      line?: number;
      start_line?: number;
    }
    return parseJSON<ApiReviewComment[]>(raw).map((c) => ({
      id: c.id,
      nodeId: c.node_id,
      author: c.user.login,
      body: c.body,
      createdAt: c.created_at,
      path: c.path ?? undefined,
      line: c.line ?? undefined,
      startLine: c.start_line ?? undefined,
    }));
  }

  async resolveReviewThreads(repo: string, prNumber: number, commentNodeIds: string[]): Promise<void> {
    if (commentNodeIds.length === 0) return;

    try {
      // Fetch all review threads for the PR in a single query
      const [owner, name] = repo.split("/");
      const threadQuery = `
        query($owner: String!, $name: String!, $prNumber: Int!) {
          repository(owner: $owner, name: $name) {
            pullRequest(number: $prNumber) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 10) {
                    nodes { id }
                  }
                }
              }
            }
          }
        }
      `;
      const threadRaw = execFileSync("gh", [
        "api", "graphql",
        "-f", `query=${threadQuery}`,
        "-F", `owner=${owner}`,
        "-F", `name=${name}`,
        "-F", `prNumber=${prNumber}`,
      ], { encoding: "utf-8" });
      const threadData = JSON.parse(threadRaw);
      const threads = threadData?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];

      const nodeIdSet = new Set(commentNodeIds);

      for (const thread of threads) {
        if (thread.isResolved) continue;
        const threadCommentIds = (thread.comments?.nodes ?? []).map((n: { id: string }) => n.id);
        if (threadCommentIds.some((id: string) => nodeIdSet.has(id))) {
          try {
            const mutation = `
              mutation($threadId: ID!) {
                resolveReviewThread(input: { threadId: $threadId }) {
                  thread { isResolved }
                }
              }
            `;
            execFileSync("gh", [
              "api", "graphql",
              "-f", `query=${mutation}`,
              "-F", `threadId=${thread.id}`,
            ], { encoding: "utf-8" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(`[gh-cli] Failed to resolve thread ${thread.id}: ${msg}\n`);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[gh-cli] Failed to fetch review threads: ${msg}\n`);
    }
  }

  async checkBranchConflicts(repoPath: string, _branch: string, base: string): Promise<{ conflicted: boolean; conflictFiles: string[] }> {
    try {
      // Fetch latest remote state
      execFileSync("git", ["fetch", "origin", base], { cwd: repoPath, encoding: "utf-8" });

      // Use merge-tree to check for conflicts without modifying the working tree
      const mergeBase = execFileSync("git", ["merge-base", "HEAD", `origin/${base}`], {
        cwd: repoPath, encoding: "utf-8",
      }).trim();

      // git merge-tree outputs conflict info without touching the worktree
      const mergeResult = execFileSync("git", ["merge-tree", mergeBase, "HEAD", `origin/${base}`], {
        cwd: repoPath, encoding: "utf-8",
      });

      // Parse merge-tree output for conflicts
      const conflictFiles: string[] = [];
      for (const line of mergeResult.split("\n")) {
        if (line.includes("changed in both")) {
          const match = line.match(/changed in both\s+base\s+\d+\s+\S+\s+\S+\s+\S+\s+(\S+)/);
          if (match) conflictFiles.push(match[1]);
        }
      }

      const hasConflicts = conflictFiles.length > 0 || mergeResult.includes("<<<<<<");
      return { conflicted: hasConflicts, conflictFiles };
    } catch {
      // If merge-base fails (no common ancestor), assume conflicted
      return { conflicted: true, conflictFiles: [] };
    }
  }

  async pushBranch(repoPath: string, branch: string, commitMessage?: string): Promise<void> {
    // Commit any uncommitted changes before pushing
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: repoPath,
      encoding: "utf-8",
    }).trim();

    if (status.length > 0) {
      execFileSync("git", ["add", "-A"], { cwd: repoPath, encoding: "utf-8" });
      execFileSync("git", ["commit", "-m", commitMessage ?? "feat: apply devagent changes"], {
        cwd: repoPath,
        encoding: "utf-8",
      });
    }

    try {
      execFileSync("git", ["push", "origin", branch], {
        cwd: repoPath,
        encoding: "utf-8",
      });
    } catch (pushErr) {
      const pushMsg = pushErr instanceof Error ? pushErr.message : String(pushErr);
      process.stderr.write(`[gh-cli] Regular push failed, retrying with --force-with-lease: ${pushMsg}\n`);
      execFileSync("git", ["push", "--force-with-lease", "origin", branch], {
        cwd: repoPath,
        encoding: "utf-8",
      });
    }
  }

  async markPRReady(repo: string, prNumber: number): Promise<void> {
    gh(["pr", "ready", String(prNumber)], repo);
  }

  async createIssue(repo: string, params: { title: string; body: string; labels?: string[] }): Promise<{ number: number; url: string }> {
    // First try with labels; if labels don't exist, retry without them
    const args = [
      "issue", "create",
      "--title", params.title,
      "--body", params.body,
    ];
    if (params.labels && params.labels.length > 0) {
      for (const label of params.labels) {
        args.push("--label", label);
      }
    }
    let url: string;
    try {
      url = gh(args, repo).trim();
    } catch {
      // Labels may not exist — retry without them
      const fallbackArgs = [
        "issue", "create",
        "--title", params.title,
        "--body", params.body,
      ];
      url = gh(fallbackArgs, repo).trim();
    }
    // Extract issue number from URL (e.g., https://github.com/owner/repo/issues/42)
    const match = url.match(/\/issues\/(\d+)/);
    const number = match ? parseInt(match[1], 10) : 0;
    return { number, url };
  }

  async fetchCIFailureLogs(repo: string, prNumber: number): Promise<{ check: string; log: string }[]> {
    const checksRaw = gh(
      ["pr", "checks", String(prNumber), "--json", "name,state,bucket,link"],
      repo,
    );
    interface CheckInfo {
      name: string;
      state: string;
      bucket: string;
      link: string;
    }
    const checks = parseJSON<CheckInfo[]>(checksRaw);
    const failed = checks.filter(
      (c) => c.bucket?.toLowerCase() === "fail",
    );

    const results: { check: string; log: string }[] = [];
    for (const check of failed) {
      try {
        // Extract run ID from link URL
        const runMatch = check.link.match(/runs\/(\d+)/);
        if (!runMatch) continue;
        const runId = runMatch[1];

        // Fetch failed log via gh run view
        const log = execFileSync("gh", ["run", "view", runId, "--log-failed", "-R", repo], {
          encoding: "utf-8",
          maxBuffer: 1024 * 1024,
        });
        // Truncate to last 200 lines to keep it manageable for the LLM
        const lines = log.split("\n");
        const truncated = lines.length > 200
          ? lines.slice(-200).join("\n")
          : log;
        results.push({ check: check.name, log: truncated });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ check: check.name, log: `Failed to fetch log: ${msg}` });
      }
    }
    return results;
  }
}
