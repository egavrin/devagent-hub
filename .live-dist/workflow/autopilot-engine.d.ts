import type { WorkflowConfig } from "./config.js";
export interface AutopilotDecision {
    action: "run" | "skip" | "escalate";
    reason: string;
    riskScore: number;
    factors: string[];
}
export interface AutopilotCandidate {
    issueNumber: number;
    title: string;
    labels: string[];
    complexity?: string;
    priority: "normal" | "high" | "urgent";
}
export declare class AutopilotEngine {
    private config;
    constructor(config: WorkflowConfig);
    /** Evaluate whether an issue should be auto-processed. */
    evaluate(candidate: AutopilotCandidate): AutopilotDecision;
    /** Check if a gate verdict is confident enough for autopilot to proceed. */
    shouldProceedAfterGate(confidence: number, changedFiles: number): AutopilotDecision;
}
