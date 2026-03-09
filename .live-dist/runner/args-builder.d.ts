/**
 * Unified argument builder for DevAgent subprocess invocation.
 * Both RunLauncher and StreamingLauncher must use this to ensure
 * identical argument construction.
 */
export interface LaunchParams {
    phase: string;
    repoPath: string;
    inputPath: string;
    outputPath: string;
    eventsPath: string;
}
export interface LaunchOptions {
    provider?: string;
    model?: string;
    maxIterations?: number;
    approvalMode?: string;
    reasoning?: string;
    /** Runner-reported supported reasoning levels; if empty/undefined, --reasoning is skipped. */
    supportedReasoningLevels?: string[];
}
export declare class InvalidLaunchConfigError extends Error {
    constructor(message: string);
}
export declare function validatePhase(phase: string): void;
export declare function validateApprovalMode(mode: string): void;
export declare function validateReasoningLevel(level: string): void;
/**
 * Build the argument array for `devagent workflow run`.
 * Validates all values before constructing the args.
 * Throws InvalidLaunchConfigError on invalid input.
 */
export declare function buildLaunchArgs(params: LaunchParams, options: LaunchOptions): string[];
