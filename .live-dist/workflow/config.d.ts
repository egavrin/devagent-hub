export declare const VALID_MODES: Set<"assisted" | "watch" | "autopilot">;
export type WorkflowMode = "assisted" | "watch" | "autopilot";
export declare class WorkflowConfigError extends Error {
    constructor(message: string);
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
    tracker: {
        kind: string;
        issue_labels_include: string[];
    };
    dispatch: {
        max_concurrency: number;
    };
    workspace: {
        mode: string;
        root: string;
    };
    runner: {
        bin?: string;
        approval_mode: string;
        max_iterations: number;
        provider?: string;
        model?: string;
        reasoning?: string;
    };
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
    verify: {
        commands: string[];
    };
    pr: {
        draft: boolean;
        open_requires: string[];
    };
    repair: {
        max_rounds: number;
    };
    handoff: {
        when: string[];
    };
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
export declare function defaultConfig(): WorkflowConfig;
/**
 * Validate a WorkflowConfig, throwing WorkflowConfigError on invalid values.
 * Called after parsing to ensure no invalid values reach the subprocess.
 */
export declare function validateConfig(config: WorkflowConfig): void;
/**
 * Parse YAML frontmatter from a WORKFLOW.md content string and return a
 * fully-populated WorkflowConfig (parsed values overlaid on defaults).
 */
export declare function parseWorkflowConfig(content: string): WorkflowConfig;
/**
 * Read WORKFLOW.md from the given repo root, parse it, and validate.
 * Returns defaults if the file does not exist.
 * Throws WorkflowConfigError on invalid values.
 */
export declare function loadWorkflowConfig(repoRoot: string): WorkflowConfig;
