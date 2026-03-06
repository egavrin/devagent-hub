import { describe, it, expect, beforeEach } from "vitest";
import { MockGitHubGateway } from "../github/mock-gateway.js";
import type { GitHubIssue } from "../github/types.js";

function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 1,
    title: "Test issue",
    body: "Issue body",
    labels: [],
    url: "https://github.com/org/repo/issues/1",
    state: "open",
    author: "alice",
    createdAt: "2026-01-01T00:00:00Z",
    comments: [],
    ...overrides,
  };
}

describe("MockGitHubGateway", () => {
  let gw: MockGitHubGateway;
  const repo = "org/repo";

  beforeEach(() => {
    gw = new MockGitHubGateway();
  });

  it("stores and retrieves issues", async () => {
    const issue = makeIssue({ number: 42, title: "Bug report" });
    gw.seedIssue(repo, issue);

    const fetched = await gw.fetchIssue(repo, 42);
    expect(fetched.number).toBe(42);
    expect(fetched.title).toBe("Bug report");
  });

  it("throws when issue not found", async () => {
    await expect(gw.fetchIssue(repo, 999)).rejects.toThrow("not found");
  });

  it("fetches eligible issues by label", async () => {
    gw.seedIssue(repo, makeIssue({ number: 1, labels: ["devagent"] }));
    gw.seedIssue(repo, makeIssue({ number: 2, labels: ["bug"] }));
    gw.seedIssue(
      repo,
      makeIssue({ number: 3, labels: ["devagent"], state: "closed" }),
    );

    const eligible = await gw.fetchEligibleIssues(repo, ["devagent"]);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].number).toBe(1);
  });

  it("creates draft PRs", async () => {
    const pr = await gw.createPR(repo, {
      title: "Fix bug",
      body: "Fixes #1",
      head: "fix/bug-1",
      base: "main",
      draft: true,
    });

    expect(pr.draft).toBe(true);
    expect(pr.state).toBe("open");
    expect(pr.head).toBe("fix/bug-1");
    expect(pr.base).toBe("main");
    expect(pr.url).toContain("/pull/");

    const fetched = await gw.fetchPR(repo, pr.number);
    expect(fetched.title).toBe("Fix bug");
  });

  it("tracks comments", async () => {
    gw.seedIssue(repo, makeIssue({ number: 10 }));

    await gw.addComment(repo, 10, "First comment");
    await gw.addComment(repo, 10, "Second comment");

    const issue = await gw.fetchIssue(repo, 10);
    expect(issue.comments).toHaveLength(2);
    expect(issue.comments[0].body).toBe("First comment");
    expect(issue.comments[1].body).toBe("Second comment");
    // Comment IDs should be unique
    expect(issue.comments[0].id).not.toBe(issue.comments[1].id);
  });

  it("manages labels — add and remove", async () => {
    gw.seedIssue(repo, makeIssue({ number: 5, labels: ["bug"] }));

    await gw.addLabels(repo, 5, ["in-progress", "priority"]);
    let issue = await gw.fetchIssue(repo, 5);
    expect(issue.labels).toContain("bug");
    expect(issue.labels).toContain("in-progress");
    expect(issue.labels).toContain("priority");

    // Adding duplicate label should not create duplicates
    await gw.addLabels(repo, 5, ["bug"]);
    issue = await gw.fetchIssue(repo, 5);
    expect(issue.labels.filter((l) => l === "bug")).toHaveLength(1);

    await gw.removeLabels(repo, 5, ["bug", "priority"]);
    issue = await gw.fetchIssue(repo, 5);
    expect(issue.labels).toEqual(["in-progress"]);
  });

  it("tracks pushed branches", async () => {
    await gw.pushBranch("/tmp/repo", "feature-branch");
    expect(gw.pushedBranches).toHaveLength(1);
    expect(gw.pushedBranches[0]).toEqual({
      repoPath: "/tmp/repo",
      branch: "feature-branch",
    });
  });

  it("fetches PR checks and review comments", async () => {
    gw.seedPR(repo, {
      number: 50,
      title: "PR with checks",
      body: "",
      url: "https://github.com/org/repo/pull/50",
      state: "open",
      draft: false,
      head: "feature",
      base: "main",
      checks: [
        { name: "ci", status: "completed", conclusion: "success" },
      ],
      reviewComments: [
        {
          id: 1,
          author: "reviewer",
          body: "LGTM",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
    });

    const checks = await gw.fetchPRChecks(repo, 50);
    expect(checks).toHaveLength(1);
    expect(checks[0].conclusion).toBe("success");

    const comments = await gw.fetchPRReviewComments(repo, 50);
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("LGTM");
  });
});
