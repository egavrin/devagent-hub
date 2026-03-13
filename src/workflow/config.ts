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
  /** Capability tags for selection policy matching (e.g., "fast", "strong", "cheap"). */
  capabilities?: string[];
}

/**
 * Selection policy: maps phase risk/complexity to profile capabilities.
 * When a phase is dispatched, the policy selects the best-matching profile.
 */
export interface SelectionPolicy {
  /** Rules evaluated top-to-bottom; first match wins. */
  rules: SelectionRule[];
}

export interface SelectionRule {
  /** Phase(s) this rule applies to. "*" matches all. */
  phases: string[];
  /** Required complexity level for this rule to match (from triage). */
  complexity?: string[];
  /** Required risk level(s) for this rule to match (e.g., ["high", "critical"]). */
  risk?: string[];
  /** Only match if changed files count <= this threshold. */
  max_changed_files?: number;
  /** Runner must have all of these capabilities to match. */
  required_capabilities?: string[];
  /** Profile name to use when this rule matches. */
  profile: string;
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
  selection_policy?: SelectionPolicy;
  skills: {
    /** Default skills applied to all stages. */
    defaults: string[];
    /** Stage-specific skill overrides. */
    by_stage: Record<string, string[]>;
    /** Path-pattern → skills mappings (glob patterns). */
    path_overrides: Record<string, string[]>;
  };
  verify: { commands: string[] };
  review: {
    max_changed_files: number;
    run_max_changed_files: number;
    max_patch_bytes: number;
    run_max_patch_bytes: number;
  };
  pr: { draft: boolean; open_requires: string[] };
  repair: { max_rounds: number };
  handoff: { when: string[] };
  autopilot: {
    poll_interval_seconds: number;
    max_concurrent_runs: number;
    eligible_labels: string[];
    priority_labels: string[];
    exclude_labels: string[];
    /** Max triage complexity autopilot will handle without escalation. */
    max_complexity: string;
    /** Min gate confidence to proceed without escalation (0-1). */
    min_gate_confidence: number;
    /** Max files changed before escalating for human review. */
    max_changed_files: number;
  };
  budget: {
    stage_wall_time_minutes: number;
    run_wall_time_minutes: number;
    run_max_cost_usd: number;
    run_max_iterations: number;
    run_max_changed_files: number;
    repo_max_cost_usd: number;
    session_max_cost_usd: number;
    max_unresolved_escalations: number;
  };
}

export function defaultConfig(): WorkflowConfig {
  return {
    version: 1,
    mode: "assisted",
    tracker: { kind: "github", issue_labels_include: ["devagent"] },
    dispatch: { max_concurrency: 4 },
    workspace: { mode: "worktree", root: "." },
    runner: {
      bin: "devagent",
      provider: "chatgpt",
      model: "gpt-5.4",
      approval_mode: "full-auto",
      max_iterations: 10,
    },
    profiles: {
      default: {
        bin: "devagent",
        provider: "chatgpt",
        model: "gpt-5.4",
      },
    },
    roles: {
      triage: "default",
      plan: "default",
      implement: "default",
      review: "default",
      repair: "default",
      gate: "default",
    },
    skills: {
      defaults: [],
      by_stage: {},
      path_overrides: {},
    },
    verify: { commands: ["bun run test", "bun run typecheck"] },
    review: {
      max_changed_files: 20,
      run_max_changed_files: 30,
      max_patch_bytes: 30_000,
      run_max_patch_bytes: 60_000,
    },
    pr: { draft: true, open_requires: ["verify"] },
    repair: { max_rounds: 3 },
    handoff: { when: ["repair_failed", "review_rejected"] },
    autopilot: {
      poll_interval_seconds: 120,
      max_concurrent_runs: 2,
      eligible_labels: ["devagent"],
      priority_labels: ["priority", "urgent", "critical"],
      exclude_labels: ["blocked", "wontfix", "duplicate"],
      max_complexity: "medium",
      min_gate_confidence: 0.7,
      max_changed_files: 20,
    },
    budget: {
      stage_wall_time_minutes: 60,
      run_wall_time_minutes: 240,
      run_max_cost_usd: 10,
      run_max_iterations: 100,
      run_max_changed_files: 30,
      repo_max_cost_usd: 50,
      session_max_cost_usd: 100,
      max_unresolved_escalations: 3,
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

  if (config.review.max_changed_files < 0) {
    throw new WorkflowConfigError(
      `review.max_changed_files must be >= 0, got ${config.review.max_changed_files}`,
    );
  }

  if (config.review.run_max_changed_files < 0) {
    throw new WorkflowConfigError(
      `review.run_max_changed_files must be >= 0, got ${config.review.run_max_changed_files}`,
    );
  }

  if (config.review.max_patch_bytes < 0) {
    throw new WorkflowConfigError(
      `review.max_patch_bytes must be >= 0, got ${config.review.max_patch_bytes}`,
    );
  }

  if (config.review.run_max_patch_bytes < 0) {
    throw new WorkflowConfigError(
      `review.run_max_patch_bytes must be >= 0, got ${config.review.run_max_patch_bytes}`,
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

function fallbackConfigFromEnv(): Partial<WorkflowConfig> {
  const provider = process.env.DEVAGENT_HUB_FALLBACK_PROVIDER?.trim();
  const model = process.env.DEVAGENT_HUB_FALLBACK_MODEL?.trim();

  if (!provider && !model) {
    return {};
  }

  return {
    runner: {
      ...defaultConfig().runner,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
    },
  };
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
    config = deepMerge(
      defaultConfig() as unknown as Record<string, unknown>,
      fallbackConfigFromEnv() as Record<string, unknown>,
    ) as unknown as WorkflowConfig;
  } else {
    const content = readFileSync(filePath, "utf-8");
    config = parseWorkflowConfig(content);
  }
  validateConfig(config);
  return config;
}
