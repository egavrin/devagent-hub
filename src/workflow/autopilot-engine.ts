import type { WorkflowConfig } from "./config.js";

export interface AutopilotDecision {
  action: "run" | "skip" | "escalate";
  reason: string;
  riskScore: number;  // 0-1
  factors: string[];  // human-readable list of decision factors
}

export interface AutopilotCandidate {
  issueNumber: number;
  title: string;
  labels: string[];
  complexity?: string;  // from triage
  priority: "normal" | "high" | "urgent";
}

export class AutopilotEngine {
  constructor(private config: WorkflowConfig) {}

  /** Evaluate whether an issue should be auto-processed. */
  evaluate(candidate: AutopilotCandidate): AutopilotDecision {
    const factors: string[] = [];
    let riskScore = 0;

    // Check exclude labels
    const excluded = candidate.labels.some(l =>
      this.config.autopilot.exclude_labels.includes(l),
    );
    if (excluded) {
      return {
        action: "skip",
        reason: "Has excluded label",
        riskScore: 0,
        factors: ["excluded label"],
      };
    }

    // Check eligible labels
    const eligible = candidate.labels.some(l =>
      this.config.autopilot.eligible_labels.includes(l),
    );
    if (!eligible) {
      return {
        action: "skip",
        reason: "Missing eligible label",
        riskScore: 0,
        factors: ["no eligible label"],
      };
    }
    factors.push("has eligible label");

    // Check priority
    const isPriority = candidate.labels.some(l =>
      this.config.autopilot.priority_labels.includes(l),
    );
    if (isPriority) {
      factors.push("priority label detected");
      riskScore += 0.1;
    }

    // Check complexity
    const complexityOrder = ["trivial", "small", "medium", "large", "epic"];
    const maxIdx = complexityOrder.indexOf(this.config.autopilot.max_complexity);
    const candidateIdx = complexityOrder.indexOf(candidate.complexity ?? "medium");
    if (candidateIdx > maxIdx) {
      factors.push(
        `complexity ${candidate.complexity} exceeds max ${this.config.autopilot.max_complexity}`,
      );
      return {
        action: "escalate",
        reason: "Complexity too high for autopilot",
        riskScore: 0.8,
        factors,
      };
    }
    factors.push(`complexity ${candidate.complexity ?? "unknown"} within bounds`);

    // Calculate risk score based on complexity
    riskScore += candidateIdx * 0.15;

    // Decision
    if (riskScore > 0.7) {
      return { action: "escalate", reason: "Risk score too high", riskScore, factors };
    }

    return { action: "run", reason: "Eligible for autopilot", riskScore, factors };
  }

  /** Check if a gate verdict is confident enough for autopilot to proceed. */
  shouldProceedAfterGate(
    confidence: number,
    changedFiles: number,
  ): AutopilotDecision {
    const factors: string[] = [];

    if (confidence < this.config.autopilot.min_gate_confidence) {
      factors.push(
        `confidence ${confidence} below threshold ${this.config.autopilot.min_gate_confidence}`,
      );
      return {
        action: "escalate",
        reason: "Gate confidence too low",
        riskScore: 1 - confidence,
        factors,
      };
    }
    factors.push(`confidence ${confidence} meets threshold`);

    if (changedFiles > this.config.autopilot.max_changed_files) {
      factors.push(
        `${changedFiles} files changed exceeds max ${this.config.autopilot.max_changed_files}`,
      );
      return {
        action: "escalate",
        reason: "Too many files changed",
        riskScore: 0.7,
        factors,
      };
    }
    factors.push(`${changedFiles} files within bounds`);

    return {
      action: "run",
      reason: "Gate passed for autopilot",
      riskScore: 1 - confidence,
      factors,
    };
  }
}
