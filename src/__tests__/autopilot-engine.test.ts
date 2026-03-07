import { describe, it, expect } from "vitest";
import { AutopilotEngine } from "../workflow/autopilot-engine.js";
import { defaultConfig } from "../workflow/config.js";
import type { AutopilotCandidate } from "../workflow/autopilot-engine.js";

function makeEngine() {
  return new AutopilotEngine(defaultConfig());
}

function makeCandidate(overrides: Partial<AutopilotCandidate> = {}): AutopilotCandidate {
  return {
    issueNumber: 1,
    title: "Test issue",
    labels: ["devagent"],
    complexity: "small",
    priority: "normal",
    ...overrides,
  };
}

describe("AutopilotEngine", () => {
  describe("evaluate", () => {
    it("skips excluded labels", () => {
      const engine = makeEngine();
      const decision = engine.evaluate(
        makeCandidate({ labels: ["devagent", "blocked"] }),
      );
      expect(decision.action).toBe("skip");
      expect(decision.reason).toBe("Has excluded label");
      expect(decision.factors).toContain("excluded label");
    });

    it("skips without eligible labels", () => {
      const engine = makeEngine();
      const decision = engine.evaluate(
        makeCandidate({ labels: ["bug"] }),
      );
      expect(decision.action).toBe("skip");
      expect(decision.reason).toBe("Missing eligible label");
      expect(decision.factors).toContain("no eligible label");
    });

    it("accepts eligible trivial issues", () => {
      const engine = makeEngine();
      const decision = engine.evaluate(
        makeCandidate({ complexity: "trivial" }),
      );
      expect(decision.action).toBe("run");
      expect(decision.reason).toBe("Eligible for autopilot");
      expect(decision.riskScore).toBeLessThan(0.7);
    });

    it("accepts eligible small issues", () => {
      const engine = makeEngine();
      const decision = engine.evaluate(
        makeCandidate({ complexity: "small" }),
      );
      expect(decision.action).toBe("run");
      expect(decision.reason).toBe("Eligible for autopilot");
    });

    it("escalates complex issues (large)", () => {
      const engine = makeEngine();
      const decision = engine.evaluate(
        makeCandidate({ complexity: "large" }),
      );
      expect(decision.action).toBe("escalate");
      expect(decision.reason).toBe("Complexity too high for autopilot");
      expect(decision.riskScore).toBe(0.8);
      expect(decision.factors.some(f => f.includes("complexity large exceeds max"))).toBe(true);
    });

    it("escalates complex issues (epic)", () => {
      const engine = makeEngine();
      const decision = engine.evaluate(
        makeCandidate({ complexity: "epic" }),
      );
      expect(decision.action).toBe("escalate");
      expect(decision.reason).toBe("Complexity too high for autopilot");
    });

    it("detects priority labels", () => {
      const engine = makeEngine();
      const decision = engine.evaluate(
        makeCandidate({ labels: ["devagent", "priority"], complexity: "small" }),
      );
      expect(decision.action).toBe("run");
      expect(decision.factors).toContain("priority label detected");
      // Priority adds 0.1 to risk score
      expect(decision.riskScore).toBeGreaterThan(0);
    });

    it("risk score increases with complexity", () => {
      const engine = makeEngine();

      const trivial = engine.evaluate(makeCandidate({ complexity: "trivial" }));
      const small = engine.evaluate(makeCandidate({ complexity: "small" }));
      const medium = engine.evaluate(makeCandidate({ complexity: "medium" }));

      expect(trivial.riskScore).toBeLessThan(small.riskScore);
      expect(small.riskScore).toBeLessThan(medium.riskScore);
    });
  });

  describe("shouldProceedAfterGate", () => {
    it("passes high confidence", () => {
      const engine = makeEngine();
      // default min_gate_confidence is 0.7
      const decision = engine.shouldProceedAfterGate(0.9, 5);
      expect(decision.action).toBe("run");
      expect(decision.reason).toBe("Gate passed for autopilot");
      expect(decision.riskScore).toBeCloseTo(0.1);
      expect(decision.factors.some(f => f.includes("meets threshold"))).toBe(true);
    });

    it("escalates low confidence", () => {
      const engine = makeEngine();
      const decision = engine.shouldProceedAfterGate(0.5, 5);
      expect(decision.action).toBe("escalate");
      expect(decision.reason).toBe("Gate confidence too low");
      expect(decision.riskScore).toBeCloseTo(0.5);
      expect(decision.factors.some(f => f.includes("below threshold"))).toBe(true);
    });

    it("escalates too many changed files", () => {
      const engine = makeEngine();
      // default max_changed_files is 20
      const decision = engine.shouldProceedAfterGate(0.9, 25);
      expect(decision.action).toBe("escalate");
      expect(decision.reason).toBe("Too many files changed");
      expect(decision.riskScore).toBe(0.7);
      expect(decision.factors.some(f => f.includes("files changed exceeds max"))).toBe(true);
    });
  });
});
