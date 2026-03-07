import { parse } from "yaml";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Valid values (must match DevAgent's workflow-contract.ts) ────

const VALID_APPROVAL_MODES = new Set([
  "suggest", "auto-edit", "full-auto",
]);

const VALID_REASONING_LEVELS = new Set([
  "low", "medium", "high", "xhigh",
]);

export const VALID_MODES = new Set([
  "assisted", "watch", "autopilot",
] as const);

export type WorkflowMode = "assisted" | "watch" | "autopilot";

export class WorkflowConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowConfigError";
  }
}

export interface AgentProfile {
  bin?: string;
  provider?: string;
  model?: string;
  reasoning?: string;
  max_iterations?: number;
  approval_mode?: string;
}

export interface WorkflowConfig {
  version: number;
  mode: WorkflowMode;
  tracker: { kind: string; issue_labels_include: string[] };
  dispatch: { max_concurrency: number };
  workspace: { mode: string; root: string };
  runner: { bin?: string; approval_mode: string; max_iterations: number; provider?: string; model?: string; reasoning?: string };
  profiles: Record<string, AgentProfile>;
  roles: Record<string, string>;
  verify: { commands: string[] };
  pr: { draft: boolean; open_requires: string[] };
  repair: { max_rounds: number };
  handoff: { when: string[] };
  autopilot: {
    poll_interval_seconds: number;
    max_concurrent_runs: number;
    eligible_labels: string[];
    priority_labels: string[];
    exclude_labels: string[];
  };
}

export function defaultConfig(): WorkflowConfig {
  return {
    version: 1,
    mode: "assisted",
    tracker: { kind: "github", issue_labels_include: ["devagent"] },
    dispatch: { max_concurrency: 4 },
    workspace: { mode: "worktree", root: "." },
    runner: { approval_mode: "full-auto", max_iterations: 10 },
    profiles: { default: {} },
    roles: {
      triage: "default",
      plan: "default",
      implement: "default",
      review: "default",
      repair: "default",
      gate: "default",
    },
    verify: { commands: ["bun run test", "bun run typecheck"] },
    pr: { draft: true, open_requires: ["verify"] },
    repair: { max_rounds: 3 },
    handoff: { when: ["repair_failed", "review_rejected"] },
    autopilot: {
      poll_interval_seconds: 120,
      max_concurrent_runs: 2,
      eligible_labels: ["devagent"],
      priority_labels: ["priority", "urgent", "critical"],
      exclude_labels: ["blocked", "wontfix", "duplicate"],
    },
  };
}

/**
 * Validate a WorkflowConfig, throwing WorkflowConfigError on invalid values.
 * Called after parsing to ensure no invalid values reach the subprocess.
 */
export function validateConfig(config: WorkflowConfig): void {
  if (!VALID_MODES.has(config.mode)) {
    throw new WorkflowConfigError(
      `Invalid mode "${config.mode}". Valid modes: ${[...VALID_MODES].join(", ")}`,
    );
  }

  if (!VALID_APPROVAL_MODES.has(config.runner.approval_mode)) {
    throw new WorkflowConfigError(
      `Invalid runner.approval_mode "${config.runner.approval_mode}". ` +
      `Valid modes: ${[...VALID_APPROVAL_MODES].join(", ")}`,
    );
  }

  if (config.runner.reasoning && !VALID_REASONING_LEVELS.has(config.runner.reasoning)) {
    throw new WorkflowConfigError(
      `Invalid runner.reasoning "${config.runner.reasoning}". ` +
      `Valid levels: ${[...VALID_REASONING_LEVELS].join(", ")}`,
    );
  }

  if (config.runner.max_iterations < 0) {
    throw new WorkflowConfigError(
      `runner.max_iterations must be >= 0, got ${config.runner.max_iterations}`,
    );
  }

  if (config.repair.max_rounds < 0) {
    throw new WorkflowConfigError(
      `repair.max_rounds must be >= 0, got ${config.repair.max_rounds}`,
    );
  }

  // Validate profiles
  for (const [name, profile] of Object.entries(config.profiles)) {
    if (profile.approval_mode && !VALID_APPROVAL_MODES.has(profile.approval_mode)) {
      throw new WorkflowConfigError(
        `Invalid approval_mode "${profile.approval_mode}" in profile "${name}"`,
      );
    }
    if (profile.reasoning && !VALID_REASONING_LEVELS.has(profile.reasoning)) {
      throw new WorkflowConfigError(
        `Invalid reasoning "${profile.reasoning}" in profile "${name}"`,
      );
    }
  }

  // Validate roles reference existing profiles
  for (const [role, profileName] of Object.entries(config.roles)) {
    if (!config.profiles[profileName]) {
      throw new WorkflowConfigError(
        `Role "${role}" references undefined profile "${profileName}". ` +
        `Available profiles: ${Object.keys(config.profiles).join(", ")}`,
      );
    }
  }
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
 * Read WORKFLOW.md from the given repo root, parse it, and validate.
 * Returns defaults if the file does not exist.
 * Throws WorkflowConfigError on invalid values.
 */
export function loadWorkflowConfig(repoRoot: string): WorkflowConfig {
  const filePath = join(repoRoot, "WORKFLOW.md");
  let config: WorkflowConfig;
  if (!existsSync(filePath)) {
    config = defaultConfig();
  } else {
    const content = readFileSync(filePath, "utf-8");
    config = parseWorkflowConfig(content);
  }
  validateConfig(config);
  return config;
}
