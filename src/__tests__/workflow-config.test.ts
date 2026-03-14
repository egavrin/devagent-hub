import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  parseWorkflowConfig,
  loadWorkflowConfig,
  resolveWorkflowConfig,
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
    expect(cfg.review).toEqual(defaultConfig().review);
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
    delete process.env.DEVAGENT_HUB_FALLBACK_PROVIDER;
    delete process.env.DEVAGENT_HUB_FALLBACK_MODEL;
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("infers npm-based verify commands when WORKFLOW.md is missing", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: {
          test: "vitest run",
          typecheck: "tsc --noEmit",
        },
      }),
    );

    const resolved = resolveWorkflowConfig(dir);

    expect(resolved.source).toBe("inferred-node");
    expect(resolved.detectedProjectKind).toBe("node");
    expect(resolved.config.verify.commands).toEqual(["npm run test", "npm run typecheck"]);
  });

  it("uses fallback provider and model from env when WORKFLOW.md is missing", () => {
    const dir = makeTmpDir();
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        packageManager: "bun@1.3.10",
        scripts: {
          test: "bun test",
        },
      }),
    );
    process.env.DEVAGENT_HUB_FALLBACK_PROVIDER = "chatgpt";
    process.env.DEVAGENT_HUB_FALLBACK_MODEL = "gpt-5.4";

    const cfg = loadWorkflowConfig(dir);

    expect(cfg.runner.provider).toBe("chatgpt");
    expect(cfg.runner.model).toBe("gpt-5.4");
    expect(cfg.verify.commands).toEqual(["bun run test"]);
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

  it("ignores fallback env when WORKFLOW.md is present", () => {
    const dir = makeTmpDir();
    process.env.DEVAGENT_HUB_FALLBACK_PROVIDER = "chatgpt";
    process.env.DEVAGENT_HUB_FALLBACK_MODEL = "gpt-5.4";
    writeFileSync(
      join(dir, "WORKFLOW.md"),
      `---
runner:
  provider: anthropic
  model: claude-sonnet-4.5
---
# Workflow
`,
    );

    const cfg = loadWorkflowConfig(dir);

    expect(cfg.runner.provider).toBe("anthropic");
    expect(cfg.runner.model).toBe("claude-sonnet-4.5");
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

  it("infers python verify commands when WORKFLOW.md is missing", () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, "pyproject.toml"), "[tool.pytest.ini_options]\naddopts = \"-q\"\n");
    writeFileSync(join(dir, "test_sample.py"), "def test_example():\n    assert True\n");

    const resolved = resolveWorkflowConfig(dir);

    expect(resolved.source).toBe("inferred-python");
    expect(resolved.config.verify.commands).toEqual(["python -m pytest"]);
  });

  it("fails fast when WORKFLOW.md is missing and no safe defaults can be inferred", () => {
    const dir = makeTmpDir();

    const resolved = resolveWorkflowConfig(dir);

    expect(resolved.source).toBe("unknown");
    expect(() => loadWorkflowConfig(dir)).toThrow(/could not infer safe defaults/i);
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

  it("rejects negative review patch limits", () => {
    const cfg = {
      ...defaultConfig(),
      review: {
        ...defaultConfig().review,
        max_patch_bytes: -1,
      },
    };
    expect(() => validateConfig(cfg)).toThrow(WorkflowConfigError);
  });
});
