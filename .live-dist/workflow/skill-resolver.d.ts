import type { WorkflowConfig } from "./config.js";
/**
 * Resolves effective skills for a given stage and set of changed files.
 * Combines: defaults + stage-specific + path-override skills.
 */
export declare function resolveSkills(config: WorkflowConfig, phase: string, changedFiles?: string[]): string[];
