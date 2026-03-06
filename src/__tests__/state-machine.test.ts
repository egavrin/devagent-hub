import { describe, it, expect } from "vitest";
import {
  canTransition,
  getValidTransitions,
  assertTransition,
  getNextPhase,
} from "../workflow/state-machine.js";
import type { WorkflowStatus } from "../state/types.js";

describe("workflow state machine", () => {
  describe("canTransition", () => {
    it("allows valid forward transitions", () => {
      expect(canTransition("new", "triaged")).toBe(true);
      expect(canTransition("triaged", "plan_draft")).toBe(true);
      expect(canTransition("plan_draft", "plan_accepted")).toBe(true);
      expect(canTransition("plan_accepted", "implementing")).toBe(true);
      expect(canTransition("implementing", "awaiting_local_verify")).toBe(true);
      expect(canTransition("awaiting_local_verify", "draft_pr_opened")).toBe(
        true,
      );
      expect(canTransition("draft_pr_opened", "awaiting_human_review")).toBe(
        true,
      );
      expect(canTransition("awaiting_human_review", "ready_to_merge")).toBe(
        true,
      );
      expect(canTransition("ready_to_merge", "done")).toBe(true);
    });

    it("allows plan revision loop", () => {
      expect(canTransition("plan_draft", "plan_revision")).toBe(true);
      expect(canTransition("plan_revision", "plan_draft")).toBe(true);
      expect(canTransition("plan_revision", "plan_accepted")).toBe(true);
    });

    it("allows auto-review fix loop", () => {
      expect(canTransition("draft_pr_opened", "auto_review_fix_loop")).toBe(
        true,
      );
      expect(canTransition("auto_review_fix_loop", "draft_pr_opened")).toBe(
        true,
      );
      expect(
        canTransition("auto_review_fix_loop", "awaiting_human_review"),
      ).toBe(true);
    });

    it("allows retry from implementing after local verify failure", () => {
      expect(canTransition("awaiting_local_verify", "implementing")).toBe(true);
    });

    it("blocks invalid transitions", () => {
      expect(canTransition("new", "implementing")).toBe(false);
      expect(canTransition("new", "done")).toBe(false);
      expect(canTransition("triaged", "done")).toBe(false);
      expect(canTransition("implementing", "triaged")).toBe(false);
      expect(canTransition("ready_to_merge", "new")).toBe(false);
    });

    it("allows transition to failed from any active state", () => {
      const activeStates: WorkflowStatus[] = [
        "new",
        "triaged",
        "plan_draft",
        "plan_revision",
        "plan_accepted",
        "implementing",
        "awaiting_local_verify",
        "draft_pr_opened",
        "auto_review_fix_loop",
        "awaiting_human_review",
        "ready_to_merge",
      ];
      for (const state of activeStates) {
        expect(canTransition(state, "failed")).toBe(true);
      }
    });

    it("allows transition to escalated from any active state", () => {
      const activeStates: WorkflowStatus[] = [
        "new",
        "triaged",
        "plan_draft",
        "plan_revision",
        "plan_accepted",
        "implementing",
        "awaiting_local_verify",
        "draft_pr_opened",
        "auto_review_fix_loop",
        "awaiting_human_review",
        "ready_to_merge",
      ];
      for (const state of activeStates) {
        expect(canTransition(state, "escalated")).toBe(true);
      }
    });

    it("allows retry from failed back to new", () => {
      expect(canTransition("failed", "new")).toBe(true);
    });

    it("blocks transitions from terminal states", () => {
      expect(canTransition("done", "new")).toBe(false);
      expect(canTransition("done", "failed")).toBe(false);
      expect(canTransition("escalated", "new")).toBe(false);
      expect(canTransition("escalated", "failed")).toBe(false);
    });
  });

  describe("getValidTransitions", () => {
    it("returns valid targets for active states", () => {
      const targets = getValidTransitions("new");
      expect(targets).toContain("triaged");
      expect(targets).toContain("failed");
      expect(targets).toContain("escalated");
      expect(targets).not.toContain("implementing");
    });

    it("returns empty array for done", () => {
      expect(getValidTransitions("done")).toEqual([]);
    });

    it("returns empty array for escalated", () => {
      expect(getValidTransitions("escalated")).toEqual([]);
    });

    it("returns a copy (not the internal array)", () => {
      const a = getValidTransitions("new");
      const b = getValidTransitions("new");
      expect(a).toEqual(b);
      a.push("done");
      expect(getValidTransitions("new")).not.toContain("done");
    });
  });

  describe("assertTransition", () => {
    it("does not throw on valid transition", () => {
      expect(() => assertTransition("new", "triaged")).not.toThrow();
    });

    it("throws on invalid transition", () => {
      expect(() => assertTransition("new", "implementing")).toThrow(
        /Invalid workflow transition: new -> implementing/,
      );
    });

    it("throws on transition from terminal state", () => {
      expect(() => assertTransition("done", "new")).toThrow(
        /Invalid workflow transition/,
      );
    });
  });

  describe("getNextPhase", () => {
    it("maps active statuses to phase names", () => {
      expect(getNextPhase("new")).toBe("triage");
      expect(getNextPhase("triaged")).toBe("plan");
      expect(getNextPhase("plan_draft")).toBe("plan_review");
      expect(getNextPhase("plan_accepted")).toBe("implement");
      expect(getNextPhase("implementing")).toBe("local_verify");
      expect(getNextPhase("awaiting_local_verify")).toBe("open_pr");
      expect(getNextPhase("draft_pr_opened")).toBe("auto_review");
      expect(getNextPhase("awaiting_human_review")).toBe("human_review");
      expect(getNextPhase("ready_to_merge")).toBe("merge");
    });

    it("returns null for terminal states", () => {
      expect(getNextPhase("done")).toBeNull();
      expect(getNextPhase("escalated")).toBeNull();
      expect(getNextPhase("failed")).toBeNull();
    });
  });
});
