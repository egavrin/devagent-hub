import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBaselineManifest, resolveHubRoot } from "../baseline/manifest.js";
import { buildBootstrapPlan, formatBootstrapSummary } from "../bootstrap/local.js";

describe("bootstrap local plan", () => {
  it("builds repos in dependency order and links the CLIs", () => {
    const hubRoot = resolveHubRoot();
    const workspaceRoot = join(hubRoot, "..");
    const plan = buildBootstrapPlan(hubRoot, workspaceRoot, loadBaselineManifest(hubRoot));

    expect(plan.repos.map((repo) => repo.name)).toEqual([
      "devagent-sdk",
      "devagent-runner",
      "devagent",
      "devagent-hub",
    ]);
    expect(plan.actions.map((action) => action.label)).toContain("devagent-runner: link CLI");
    expect(plan.actions.map((action) => action.label)).toContain("devagent: link CLI");
    expect(plan.actions.map((action) => action.label)).toContain("devagent-hub: link CLI");
    expect(plan.readyCommands).toEqual(["devagent", "devagent-runner", "devagent-hub"]);
  });

  it("formats a short operator summary", () => {
    const hubRoot = resolveHubRoot();
    const workspaceRoot = join(hubRoot, "..");
    const plan = buildBootstrapPlan(hubRoot, workspaceRoot, loadBaselineManifest(hubRoot));
    const summary = formatBootstrapSummary(plan);

    expect(summary).toContain("Ready commands: devagent, devagent-runner, devagent-hub");
    expect(summary).toContain("devagent-hub project add");
  });
});
