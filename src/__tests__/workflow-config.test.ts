import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  parseWorkflowConfig,
  loadWorkflowConfig,
  defaultConfig,
} from "../workflow/config.js";

describe("parseWorkflowConfig", () => {
  it("parses YAML frontmatter correctly", () => {
    const content = `---
version: 2
tracker:
  kind: linear
  issue_labels_include: [bug, feature]
runner:
  approval_mode: manual
  max_iterations: 5
verify:
  commands:
    - npm test
    - npm run lint
repair:
  max_rounds: 7
---

# My Workflow

Some description here.
`;
    const cfg = parseWorkflowConfig(content);
    expect(cfg.version).toBe(2);
    expect(cfg.tracker.kind).toBe("linear");
    expect(cfg.tracker.issue_labels_include).toEqual(["bug", "feature"]);
    expect(cfg.runner.approval_mode).toBe("manual");
    expect(cfg.runner.max_iterations).toBe(5);
    expect(cfg.verify.commands).toEqual(["npm test", "npm run lint"]);
    expect(cfg.repair.max_rounds).toBe(7);
  });

  it("returns defaults when no frontmatter present", () => {
    const content = "# Just a markdown file\n\nNo frontmatter here.";
    const cfg = parseWorkflowConfig(content);
    expect(cfg).toEqual(defaultConfig());
  });

  it("handles partial config — missing fields use defaults", () => {
    const content = `---
version: 3
dispatch:
  max_concurrency: 8
---
`;
    const cfg = parseWorkflowConfig(content);
    expect(cfg.version).toBe(3);
    expect(cfg.dispatch.max_concurrency).toBe(8);
    // Everything else should be defaults
    expect(cfg.tracker).toEqual(defaultConfig().tracker);
    expect(cfg.runner).toEqual(defaultConfig().runner);
    expect(cfg.verify).toEqual(defaultConfig().verify);
    expect(cfg.pr).toEqual(defaultConfig().pr);
    expect(cfg.repair).toEqual(defaultConfig().repair);
    expect(cfg.roles).toEqual(defaultConfig().roles);
    expect(cfg.handoff).toEqual(defaultConfig().handoff);
    expect(cfg.workspace).toEqual(defaultConfig().workspace);
  });
});

describe("loadWorkflowConfig", () => {
  let tmpDir: string;

  function makeTmpDir(): string {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-config-test-"));
    return tmpDir;
  }

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns defaults when file does not exist", () => {
    const dir = makeTmpDir();
    const cfg = loadWorkflowConfig(dir);
    expect(cfg).toEqual(defaultConfig());
  });

  it("reads and parses WORKFLOW.md from repo root", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "WORKFLOW.md"),
      `---
version: 4
pr:
  draft: false
  open_requires: [verify, review]
---
# Workflow
`,
    );
    const cfg = loadWorkflowConfig(dir);
    expect(cfg.version).toBe(4);
    expect(cfg.pr.draft).toBe(false);
    expect(cfg.pr.open_requires).toEqual(["verify", "review"]);
    // defaults preserved
    expect(cfg.runner).toEqual(defaultConfig().runner);
  });
});
