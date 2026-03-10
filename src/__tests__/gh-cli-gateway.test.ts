import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileSyncMock = vi.fn();
const stderrWriteMock = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

describe("GhCliGateway", () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
    stderrWriteMock.mockClear();
  });

  it("fetchEligibleIssues lists issues with a GET request and query params", async () => {
    execFileSyncMock.mockReturnValue(JSON.stringify([
      {
        number: 12,
        title: "Live validation issue",
        body: "Validate import path",
        labels: [{ name: "devagent" }],
        html_url: "https://github.com/org/repo/issues/12",
        state: "open",
        user: { login: "egavrin" },
        created_at: "2026-03-10T00:00:00Z",
      },
    ]));

    const { GhCliGateway } = await import("../github/gh-cli-gateway.js");
    const gateway = new GhCliGateway();
    const issues = await gateway.fetchEligibleIssues("org/repo", ["devagent", "priority"]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.number).toBe(12);
    expect(execFileSyncMock).toHaveBeenCalledWith(
      "gh",
      [
        "api",
        "-X",
        "GET",
        "repos/org/repo/issues",
        "-f",
        "state=open",
        "-f",
        "labels=devagent,priority",
        "-f",
        "per_page=50",
      ],
      { encoding: "utf-8" },
    );
  });

  it("fetchIssue maps REST comment node ids", async () => {
    execFileSyncMock
      .mockReturnValueOnce(JSON.stringify({
        number: 42,
        title: "Gateway issue",
        body: "Body",
        labels: [],
        html_url: "https://github.com/org/repo/issues/42",
        state: "open",
        user: { login: "egavrin" },
        created_at: "2026-03-10T00:00:00Z",
      }))
      .mockReturnValueOnce(JSON.stringify([
        {
          id: 7,
          node_id: "IC_kwDOTest",
          user: { login: "reviewer" },
          body: "Needs attention",
          created_at: "2026-03-10T00:05:00Z",
        },
      ]));

    const { GhCliGateway } = await import("../github/gh-cli-gateway.js");
    const gateway = new GhCliGateway();
    const issue = await gateway.fetchIssue("org/repo", 42);

    expect(issue.comments).toEqual([
      expect.objectContaining({
        id: 7,
        nodeId: "IC_kwDOTest",
        author: "reviewer",
      }),
    ]);
  });

  it("createIssue logs label failures and retries without labels", async () => {
    execFileSyncMock
      .mockImplementationOnce(() => {
        throw new Error("label does not exist");
      })
      .mockReturnValueOnce("https://github.com/org/repo/issues/77\n");

    const { GhCliGateway } = await import("../github/gh-cli-gateway.js");
    const gateway = new GhCliGateway();
    const result = await gateway.createIssue("org/repo", {
      title: "Fallback issue",
      body: "Body",
      labels: ["missing"],
    });

    expect(result).toEqual({
      number: 77,
      url: "https://github.com/org/repo/issues/77",
    });
    expect(stderrWriteMock).toHaveBeenCalledWith(
      expect.stringContaining("Issue create with labels failed in org/repo; retrying without labels"),
    );
    expect(execFileSyncMock).toHaveBeenNthCalledWith(
      2,
      "gh",
      ["-R", "org/repo", "issue", "create", "--title", "Fallback issue", "--body", "Body"],
      { encoding: "utf-8" },
    );
  });
});
