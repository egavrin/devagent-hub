export interface GateVerdict {
    action: "proceed" | "rework" | "escalate";
    reason: string;
    findings?: unknown[];
}
export interface GateContext {
    workflowRunId: string;
    repoPath: string;
    issueNumber: number;
}
/**
 * ReviewGate evaluates stage output between workflow phases.
 * In watch mode, gates replace human approval for stage transitions.
 */
export interface ReviewGate {
    evaluate(phase: string, output: Record<string, unknown>, context: GateContext): Promise<GateVerdict>;
}
/**
 * LLMReviewGate uses the runner to evaluate stage outputs via LLM review.
 * Launches a "review" phase with the stage output as context.
 */
export declare class LLMReviewGate implements ReviewGate {
    private launcher;
    constructor(launcher: LLMReviewGate["launcher"]);
    evaluate(phase: string, output: Record<string, unknown>, context: GateContext): Promise<GateVerdict>;
}
