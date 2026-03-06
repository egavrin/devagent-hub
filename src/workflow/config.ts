import { parse } from "yaml";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface WorkflowConfig {
  version: number;
  tracker: { kind: string; issue_labels_include: string[] };
  dispatch: { max_concurrency: number };
  workspace: { mode: string; root: string };
  runner: { approval_mode: string; max_iterations: number };
  roles: { triage: string; plan: string; implement: string; review: string };
  verify: { commands: string[] };
  pr: { draft: boolean; open_requires: string[] };
  repair: { max_rounds: number };
  handoff: { when: string[] };
}

export function defaultConfig(): WorkflowConfig {
  return {
    version: 1,
    tracker: { kind: "github", issue_labels_include: ["devagent"] },
    dispatch: { max_concurrency: 4 },
    workspace: { mode: "worktree", root: "." },
    runner: { approval_mode: "auto", max_iterations: 10 },
    roles: {
      triage: "devagent",
      plan: "devagent",
      implement: "devagent",
      review: "devagent",
    },
    verify: { commands: ["bun run test", "bun run typecheck"] },
    pr: { draft: true, open_requires: ["verify"] },
    repair: { max_rounds: 3 },
    handoff: { when: ["repair_failed", "review_rejected"] },
  };
}

/**
 * Deep-merge source into target, returning a new object.
 * Arrays in source replace target arrays entirely.
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }
  return result as T;
}

/**
 * Extract YAML frontmatter (between leading `---` markers) from a string.
 */
function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : null;
}

/**
 * Parse YAML frontmatter from a WORKFLOW.md content string and return a
 * fully-populated WorkflowConfig (parsed values overlaid on defaults).
 */
export function parseWorkflowConfig(content: string): WorkflowConfig {
  const yaml = extractFrontmatter(content);
  if (!yaml) {
    return defaultConfig();
  }
  const parsed = parse(yaml) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object") {
    return defaultConfig();
  }
  return deepMerge(defaultConfig() as unknown as Record<string, unknown>, parsed) as unknown as WorkflowConfig;
}

/**
 * Read WORKFLOW.md from the given repo root and parse it.
 * Returns defaults if the file does not exist.
 */
export function loadWorkflowConfig(repoRoot: string): WorkflowConfig {
  const filePath = join(repoRoot, "WORKFLOW.md");
  if (!existsSync(filePath)) {
    return defaultConfig();
  }
  const content = readFileSync(filePath, "utf-8");
  return parseWorkflowConfig(content);
}
