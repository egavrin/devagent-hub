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

function logGhCliError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[gh-cli] ${context}: ${message}\n`);
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
  node_id?: string;
  user: { login: string };
  body: string;
  created_at: string;
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

function mapComment(c: ApiComment): GitHubComment {
  return {
    id: c.id,
    nodeId: c.node_id,
    author: c.user.login,
    body: c.body,
    createdAt: c.created_at,
  };
}

function fetchUnresolvedReviewCommentNodeIds(repo: string, prNumber: number): Set<string> | null {
  try {
    const [owner, name] = repo.split("/");
    const query = `
      query($owner: String!, $name: String!, $prNumber: Int!) {
        repository(owner: $owner, name: $name) {
          pullRequest(number: $prNumber) {
            reviewThreads(first: 100) {
              nodes {
                isResolved
                comments(first: 20) {
                  nodes { id }
                }
              }
            }
          }
        }
      }
    `;
    const raw = execFileSync("gh", [
      "api", "graphql",
      "-f", `query=${query}`,
      "-F", `owner=${owner}`,
      "-F", `name=${name}`,
      "-F", `prNumber=${prNumber}`,
    ], { encoding: "utf-8" });
    const data = JSON.parse(raw);
    const threads = data?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
    const ids = new Set<string>();
    for (const thread of threads) {
      if (thread?.isResolved) continue;
      for (const comment of thread?.comments?.nodes ?? []) {
        if (typeof comment?.id === "string" && comment.id.length > 0) {
          ids.add(comment.id);
        }
      }
    }
    return ids;
  } catch (error) {
    logGhCliError(
      `Failed to fetch unresolved review thread comment ids for PR #${prNumber} in ${repo}`,
      error,
    );
    return null;
  }
}

function mapPRState(state: string): "open" | "closed" | "merged" {
  const s = state.toLowerCase();
  if (s === "merged") return "merged";
  if (s === "closed") return "closed";
  return "open";
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
      comments: comments.map(mapComment),
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
      } catch (error) {
        logGhCliError(
          `Failed to remove label "${label}" from issue ${issueNumber} in ${repo}`,
          error,
        );
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
    const unresolvedNodeIds = fetchUnresolvedReviewCommentNodeIds(repo, prNumber);
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
      isResolved: unresolvedNodeIds
        ? !c.node_id || !unresolvedNodeIds.has(c.node_id)
        : undefined,
      author: c.user.login,
      body: c.body,
      createdAt: c.created_at,
      path: c.path ?? undefined,
      line: c.line ?? undefined,
      startLine: c.start_line ?? undefined,
    }));
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
    } catch (error) {
      logGhCliError(
        `Failed to check conflicts for ${repoPath} against origin/${base}; assuming conflicted`,
        error,
      );
      return { conflicted: true, conflictFiles: [] };
    }
  }

  async pushBranch(repoPath: string, branch: string, commitMessage?: string): Promise<{ pushedCommit: boolean; pushedSha?: string }> {
    // Commit any uncommitted changes before pushing
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: repoPath,
      encoding: "utf-8",
    }).trim();
    const pushedCommit = status.length > 0;

    if (pushedCommit) {
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

    const headSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoPath,
      encoding: "utf-8",
    }).trim();

    return {
      pushedCommit,
      pushedSha: headSha || undefined,
    };
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
    } catch (error) {
      logGhCliError(
        `Issue create with labels failed in ${repo}; retrying without labels`,
        error,
      );
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
