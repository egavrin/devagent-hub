import type { LaunchResult } from "../runner/launcher.js";

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
export class LLMReviewGate implements ReviewGate {
  private launcher: {
    launch(params: { phase: string; repoPath: string; runId: string; input: unknown }): LaunchResult | Promise<LaunchResult>;
  };

  constructor(launcher: LLMReviewGate["launcher"]) {
    this.launcher = launcher;
  }

  async evaluate(
    phase: string,
    output: Record<string, unknown>,
    context: GateContext,
  ): Promise<GateVerdict> {
    const result = await this.launcher.launch({
      phase: "review",
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

    const reviewOutput = result.output as Record<string, unknown> | null;
    const verdict = (reviewOutput?.verdict as string) ?? "pass";
    const blockingCount = (reviewOutput?.blockingCount as number) ?? 0;
    const summary = (reviewOutput?.summary as string) ?? `Gate review for ${phase} complete.`;
    const findings = (reviewOutput?.findings as unknown[]) ?? [];

    if (verdict === "block" || blockingCount > 0) {
      return { action: "rework", reason: summary, findings };
    }

    return { action: "proceed", reason: summary };
  }
}
