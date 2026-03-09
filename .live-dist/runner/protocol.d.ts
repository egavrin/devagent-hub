/**
 * Runner protocol types — defines the contract between Hub and DevAgent runner.
 */
export declare const RUNNER_CONTRACT_VERSION = 1;
export interface RunnerProtocol {
    contractVersion: number;
    commands: {
        describe: boolean;
        run: boolean;
        cancel: boolean;
        health: boolean;
    };
    phases: string[];
    approvalModes: string[];
    reasoningLevels: string[];
    providers: string[];
    models: string[];
    capabilities: string[];
    limits: {
        maxIterations?: number;
        maxConcurrent?: number;
    };
}
export interface RunnerCompatResult {
    compatible: boolean;
    warnings: string[];
    errors: string[];
    capabilities: RunnerProtocol;
}
