import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileSyncMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

describe("GhCliGateway", () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
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
});
