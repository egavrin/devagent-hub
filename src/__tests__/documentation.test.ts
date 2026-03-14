import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHubRoot } from "../baseline/manifest.js";

describe("documentation parity", () => {
  const hubRoot = resolveHubRoot();
  const skillDir = join(hubRoot, ".agents", "skills");
  const activeGuidanceFiles = [
    join(hubRoot, "README.md"),
    join(hubRoot, "BASELINE_VALIDATION.md"),
    join(hubRoot, "WORKFLOW.md"),
    join(hubRoot, "AGENTS.md"),
    ...readdirSync(skillDir)
      .map((name) => join(skillDir, name, "SKILL.md")),
  ];

  it("does not ship absolute local filesystem paths in public docs", () => {
    const files = [
      join(hubRoot, "README.md"),
      join(hubRoot, "BASELINE_VALIDATION.md"),
      join(hubRoot, "WORKFLOW.md"),
    ];

    for (const file of files) {
      expect(readFileSync(file, "utf-8")).not.toContain("/Users/");
    }
  });

  it("documents bootstrap and human review commands", () => {
    const readme = readFileSync(join(hubRoot, "README.md"), "utf-8");
    expect(readme).toContain("bun run bootstrap:local");
    expect(readme).toContain("devagent-hub status <workflow-id>");
    expect(readme).toContain("devagent-hub run reject <workflow-id> --note");
    expect(readme).toContain("devagent-hub pr repair <workflow-id>");
    expect(readme).not.toContain("devagent-hub tui");
  });

  it("does not document removed legacy hub surfaces in live docs", () => {
    for (const file of activeGuidanceFiles) {
      const contents = readFileSync(file, "utf-8");
      expect(contents).not.toContain("devagent-hub tui");
      expect(contents).not.toContain("devagent-hub ui");
      expect(contents).not.toContain("Ink");
      expect(contents).not.toContain("bun:sqlite");
      expect(contents).not.toContain("src/runner/");
      expect(contents).not.toContain("src/state/");
      expect(contents).not.toContain("src/workspace/");
      expect(contents).not.toContain("assertTransition()");
      expect(contents).not.toContain("selection-policy.test.ts");
      expect(contents).not.toContain("LauncherFactory");
      expect(contents).not.toContain("approval_requests");
    }
  });

  it("documents the active local skill set in AGENTS", () => {
    const agents = readFileSync(join(hubRoot, "AGENTS.md"), "utf-8");
    expect(agents).toContain("## Local Skills");
    expect(agents).toContain("runner-integration");
    expect(agents).toContain("security-checklist");
    expect(agents).toContain("state-machine");
    expect(agents).toContain("testing");
    expect(agents).toContain("baseline-validation");
  });
});
