import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHubRoot } from "../baseline/manifest.js";

describe("documentation parity", () => {
  const hubRoot = resolveHubRoot();

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
  });
});
