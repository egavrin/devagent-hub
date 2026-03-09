import type { RunnerAdapter, LaunchParams, RunnerCapabilities, RunnerHealth } from "./runner-adapter.js";
import type { LaunchResult } from "./launcher.js";
export interface OpenCodeConfig {
    bin: string;
    model: string;
    artifactsDir?: string;
    timeout?: number;
    env?: Record<string, string>;
}
/**
 * Runner adapter for OpenCode CLI.
 * Translates workflow phases into opencode `run` commands with structured prompts.
 * Uses DeepSeek (or any configured model) via opencode's --model flag.
 */
export declare class OpenCodeRunner implements RunnerAdapter {
    readonly id = "opencode";
    readonly name = "OpenCode";
    private config;
    private artifactsDir;
    constructor(config: OpenCodeConfig);
    launch(params: LaunchParams): LaunchResult;
    describe(): RunnerCapabilities | null;
    health(): RunnerHealth | null;
    cancel(_runId: string): boolean;
    /**
     * Extract JSON output from opencode's JSON event stream.
     * Events are newline-delimited JSON objects with { type, ... }.
     * We look for the text event containing our structured response.
     */
    private extractJsonOutput;
    /** Parse JSON from text that might have markdown fences or extra content. */
    private parseJsonFromText;
}
