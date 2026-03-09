import type { WorkflowConfig } from "../workflow/config.js";
import type { RunnerAdapter, RunnerCapabilities } from "./runner-adapter.js";
import type { ProcessRegistry } from "./process-registry.js";
/**
 * Creates phase-configured launchers based on WorkflowConfig profiles and roles.
 * Each phase gets a launcher with settings from its assigned profile,
 * merged over the base runner config.
 *
 * Supports multiple runner types:
 * - DevAgent (default): uses RunLauncher / StreamingLauncher
 * - OpenCode: uses OpenCodeRunner adapter
 */
export declare class LauncherFactory {
    private config;
    private syncCache;
    private streamingCache;
    private artifactsDir;
    private registry?;
    constructor(config: WorkflowConfig, registry?: ProcessRegistry);
    /**
     * Resolve profile name for a phase, considering selection policy.
     * Policy rules are evaluated top-to-bottom; first match wins.
     * Falls back to roles config, then "default".
     */
    resolveProfile(phase: string, context?: {
        complexity?: string;
        risk?: string;
        changedFiles?: number;
    }): string;
    /** Get a sync launcher configured for the given phase. */
    getLauncher(phase: string, context?: {
        complexity?: string;
        risk?: string;
        changedFiles?: number;
    }): RunnerAdapter;
    /** Get a streaming launcher configured for the given phase. Requires registry for devagent. */
    getStreamingLauncher(phase: string, context?: {
        complexity?: string;
        risk?: string;
        changedFiles?: number;
    }): RunnerAdapter;
    /** Describe all unique runner binaries across profiles. */
    describeRunners(): Map<string, RunnerCapabilities | null>;
    /** Create a sync adapter for the given profile. */
    private createAdapter;
    /** Create a streaming adapter for the given profile. */
    private createStreamingAdapter;
    private isOpenCodeBin;
    private isClaudeBin;
    private isCodexBin;
    private resolveModel;
    private resolveEnv;
    private mergeDevagentConfig;
}
