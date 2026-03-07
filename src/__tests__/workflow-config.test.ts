import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  parseWorkflowConfig,
  loadWorkflowConfig,
  defaultConfig,
  validateConfig,
  WorkflowConfigError,
} from "../workflow/config.js";

describe("parseWorkflowConfig", () => {
  it("parses YAML frontmatter correctly", () => {
    const content = `---
version: 2
tracker:
  kind: linear
  issue_labels_include: [bug, feature]
runner:
  approval_mode: full-auto
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
    expect(cfg.runner.approval_mode).toBe("full-auto");
    expect(cfg.runner.max_iterations).toBe(5);
    expect(cfg.verify.commands).toEqual(["npm test", "npm run lint"]);
    expect(cfg.repair.max_rounds).toBe(7);
  });

  it("parses mode field", () => {
    const content = `---
mode: watch
---
`;
    const cfg = parseWorkflowConfig(content);
    expect(cfg.mode).toBe("watch");
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

  it("throws on invalid approval_mode in WORKFLOW.md", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "WORKFLOW.md"),
      `---
runner:
  approval_mode: auto
---
`,
    );
    expect(() => loadWorkflowConfig(dir)).toThrow(WorkflowConfigError);
  });

  it("throws on invalid reasoning in WORKFLOW.md", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "WORKFLOW.md"),
      `---
runner:
  reasoning: ultra
---
`,
    );
    expect(() => loadWorkflowConfig(dir)).toThrow(WorkflowConfigError);
  });
});

describe("validateConfig", () => {
  it("accepts valid default config", () => {
    expect(() => validateConfig(defaultConfig())).not.toThrow();
  });

  it("rejects approval_mode: auto", () => {
    const cfg = { ...defaultConfig(), runner: { ...defaultConfig().runner, approval_mode: "auto" } };
    expect(() => validateConfig(cfg)).toThrow(WorkflowConfigError);
  });

  it("rejects reasoning: ultra", () => {
    const cfg = { ...defaultConfig(), runner: { ...defaultConfig().runner, reasoning: "ultra" } };
    expect(() => validateConfig(cfg)).toThrow(WorkflowConfigError);
  });

  it("accepts valid approval modes", () => {
    for (const mode of ["suggest", "auto-edit", "full-auto"]) {
      const cfg = { ...defaultConfig(), runner: { ...defaultConfig().runner, approval_mode: mode } };
      expect(() => validateConfig(cfg)).not.toThrow();
    }
  });

  it("accepts valid reasoning levels", () => {
    for (const level of ["low", "medium", "high", "xhigh"]) {
      const cfg = { ...defaultConfig(), runner: { ...defaultConfig().runner, reasoning: level } };
      expect(() => validateConfig(cfg)).not.toThrow();
    }
  });

  it("accepts undefined reasoning", () => {
    const cfg = { ...defaultConfig(), runner: { ...defaultConfig().runner, reasoning: undefined } };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it("accepts valid modes: assisted, watch, autopilot", () => {
    for (const mode of ["assisted", "watch", "autopilot"] as const) {
      const cfg = { ...defaultConfig(), mode };
      expect(() => validateConfig(cfg)).not.toThrow();
    }
  });

  it("rejects invalid mode", () => {
    const cfg = { ...defaultConfig(), mode: "yolo" as any };
    expect(() => validateConfig(cfg)).toThrow(WorkflowConfigError);
  });

  it("defaults mode to assisted", () => {
    expect(defaultConfig().mode).toBe("assisted");
  });
});
