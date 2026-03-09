/**
 * LLMReviewGate uses the runner to evaluate stage outputs via LLM review.
 * Launches a "review" phase with the stage output as context.
 */
export class LLMReviewGate {
    launcher;
    constructor(launcher) {
        this.launcher = launcher;
    }
    async evaluate(phase, output, context) {
        const result = await this.launcher.launch({
            phase: "gate",
            repoPath: context.repoPath,
            runId: `gate-${phase}-${context.workflowRunId}`,
            input: {
                sourcePhase: phase,
                issueNumber: context.issueNumber,
                stageOutput: output,
            },
        });
        if (result.exitCode !== 0) {
            return {
                action: "escalate",
                reason: `Gate review for "${phase}" failed with exit code ${result.exitCode}`,
            };
        }
        const reviewOutput = result.output;
        const verdict = reviewOutput?.verdict ?? "pass";
        const blockingCount = reviewOutput?.blockingCount ?? 0;
        const summary = reviewOutput?.summary ?? `Gate review for ${phase} complete.`;
        const findings = reviewOutput?.findings ?? [];
        if (verdict === "block" || blockingCount > 0) {
            return { action: "rework", reason: summary, findings };
        }
        return { action: "proceed", reason: summary };
    }
}
