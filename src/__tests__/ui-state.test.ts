import { describe, it, expect } from "vitest";
import { uiReducer, initialUIState } from "../tui/state.js";
import type { UIState, UIAction } from "../tui/state.js";

function dispatch(state: UIState, ...actions: UIAction[]): UIState {
  return actions.reduce(uiReducer, state);
}

describe("uiReducer", () => {
  // ─── Screen navigation ─────────────────────────────────────

  describe("screen navigation", () => {
    it("starts on dashboard", () => {
      expect(initialUIState.screen).toBe("dashboard");
      expect(initialUIState.focusedPane).toBe("queue");
    });

    it("OPEN_RUN switches to run screen with artifact pane focused", () => {
      const s = dispatch(initialUIState, { type: "OPEN_RUN", runId: "r1" });
      expect(s.screen).toBe("run");
      expect(s.selectedRunId).toBe("r1");
      expect(s.focusedPane).toBe("artifact");
    });

    it("OPEN_RUN clears dialog and diff state", () => {
      const withDialog = dispatch(initialUIState,
        { type: "OPEN_DIALOG", dialog: "new-run" },
      );
      expect(withDialog.dialog).toBe("new-run");

      const s = dispatch(withDialog, { type: "OPEN_RUN", runId: "r1" });
      expect(s.dialog).toBeNull();
      expect(s.showArtifactDiff).toBe(false);
    });

    it("SET_SCREEN to approvals resets approvalIndex", () => {
      const withIndex = dispatch(initialUIState, { type: "SET_APPROVAL_INDEX", index: 5 });
      const s = dispatch(withIndex, { type: "SET_SCREEN", screen: "approvals" });
      expect(s.screen).toBe("approvals");
      expect(s.approvalIndex).toBe(0);
    });

    it("BACK from run returns to dashboard", () => {
      const inRun = dispatch(initialUIState, { type: "OPEN_RUN", runId: "r1" });
      const s = dispatch(inRun, { type: "BACK" });
      expect(s.screen).toBe("dashboard");
      expect(s.focusedPane).toBe("queue");
    });

    it("BACK from approvals returns to dashboard", () => {
      const inApprovals = dispatch(initialUIState, { type: "SET_SCREEN", screen: "approvals" });
      const s = dispatch(inApprovals, { type: "BACK" });
      expect(s.screen).toBe("dashboard");
    });

    it("BACK on dashboard is a no-op", () => {
      const s = dispatch(initialUIState, { type: "BACK" });
      expect(s).toEqual(initialUIState);
    });
  });

  // ─── Pane cycling ──────────────────────────────────────────

  describe("pane cycling", () => {
    it("NEXT_PANE cycles through queue -> artifact -> timeline -> logs -> queue", () => {
      let s = initialUIState;
      expect(s.focusedPane).toBe("queue");

      s = dispatch(s, { type: "NEXT_PANE" });
      expect(s.focusedPane).toBe("artifact");

      s = dispatch(s, { type: "NEXT_PANE" });
      expect(s.focusedPane).toBe("timeline");

      s = dispatch(s, { type: "NEXT_PANE" });
      expect(s.focusedPane).toBe("logs");

      s = dispatch(s, { type: "NEXT_PANE" });
      expect(s.focusedPane).toBe("queue");
    });

    it("PREV_PANE cycles backward", () => {
      let s = initialUIState;
      s = dispatch(s, { type: "PREV_PANE" });
      expect(s.focusedPane).toBe("logs");

      s = dispatch(s, { type: "PREV_PANE" });
      expect(s.focusedPane).toBe("timeline");
    });

    it("SET_FOCUSED_PANE sets directly", () => {
      const s = dispatch(initialUIState, { type: "SET_FOCUSED_PANE", pane: "logs" });
      expect(s.focusedPane).toBe("logs");
    });
  });

  // ─── Dialog management ─────────────────────────────────────

  describe("dialogs", () => {
    it("OPEN_DIALOG new-run resets form", () => {
      const withData = {
        ...initialUIState,
        newRunForm: { sourceType: "pr" as const, sourceId: "42", mode: "watch" as const, profile: "fast", runner: "claude", model: "sonnet", gateStrictness: "normal" as const, priority: "normal" as const },
      };
      const s = dispatch(withData, { type: "OPEN_DIALOG", dialog: "new-run" });
      expect(s.dialog).toBe("new-run");
      expect(s.newRunForm).toEqual({ sourceType: "issue", sourceId: "", mode: "assisted", profile: "", runner: "", model: "", gateStrictness: "normal", priority: "normal" });
    });

    it("OPEN_DIALOG rework resets note", () => {
      const withNote = { ...initialUIState, reworkNote: "old note" };
      const s = dispatch(withNote, { type: "OPEN_DIALOG", dialog: "rework" });
      expect(s.dialog).toBe("rework");
      expect(s.reworkNote).toBe("");
    });

    it("CLOSE_DIALOG clears dialog", () => {
      const withDialog = dispatch(initialUIState, { type: "OPEN_DIALOG", dialog: "new-run" });
      const s = dispatch(withDialog, { type: "CLOSE_DIALOG" });
      expect(s.dialog).toBeNull();
    });

    it("BACK closes dialog before navigating", () => {
      const inRunWithDialog = dispatch(initialUIState,
        { type: "OPEN_RUN", runId: "r1" },
        { type: "OPEN_DIALOG", dialog: "rework" },
      );
      expect(inRunWithDialog.screen).toBe("run");
      expect(inRunWithDialog.dialog).toBe("rework");

      // First BACK closes dialog
      const s1 = dispatch(inRunWithDialog, { type: "BACK" });
      expect(s1.dialog).toBeNull();
      expect(s1.screen).toBe("run");

      // Second BACK goes to dashboard
      const s2 = dispatch(s1, { type: "BACK" });
      expect(s2.screen).toBe("dashboard");
    });
  });

  // ─── New run form ──────────────────────────────────────────

  describe("new run form", () => {
    it("SET_NEW_RUN_SOURCE_TYPE changes source type", () => {
      const s = dispatch(initialUIState, { type: "SET_NEW_RUN_SOURCE_TYPE", sourceType: "pr" });
      expect(s.newRunForm.sourceType).toBe("pr");
    });

    it("SET_NEW_RUN_SOURCE_ID changes source id", () => {
      const s = dispatch(initialUIState, { type: "SET_NEW_RUN_SOURCE_ID", value: "123" });
      expect(s.newRunForm.sourceId).toBe("123");
    });

    it("SET_NEW_RUN_MODE changes mode", () => {
      const s = dispatch(initialUIState, { type: "SET_NEW_RUN_MODE", mode: "watch" });
      expect(s.newRunForm.mode).toBe("watch");
    });

    it("SET_NEW_RUN_RUNNER changes runner", () => {
      const s = dispatch(initialUIState, { type: "SET_NEW_RUN_RUNNER", runner: "claude" });
      expect(s.newRunForm.runner).toBe("claude");
    });

    it("SET_NEW_RUN_MODEL changes model", () => {
      const s = dispatch(initialUIState, { type: "SET_NEW_RUN_MODEL", model: "opus" });
      expect(s.newRunForm.model).toBe("opus");
    });

    it("SET_NEW_RUN_MODE supports autopilot-once", () => {
      const s = dispatch(initialUIState, { type: "SET_NEW_RUN_MODE", mode: "autopilot-once" });
      expect(s.newRunForm.mode).toBe("autopilot-once");
    });

    it("form fields are independent", () => {
      const s = dispatch(initialUIState,
        { type: "SET_NEW_RUN_SOURCE_TYPE", sourceType: "pr" },
        { type: "SET_NEW_RUN_SOURCE_ID", value: "99" },
        { type: "SET_NEW_RUN_MODE", mode: "watch" },
      );
      expect(s.newRunForm).toEqual({ sourceType: "pr", sourceId: "99", mode: "watch", profile: "", runner: "", model: "", gateStrictness: "normal", priority: "normal" });
    });

    it("OPEN_DIALOG new-run resets runner and model", () => {
      const withData = {
        ...initialUIState,
        newRunForm: { sourceType: "pr" as const, sourceId: "42", mode: "watch" as const, profile: "fast", runner: "claude", model: "opus", gateStrictness: "strict" as const, priority: "high" as const },
      };
      const s = dispatch(withData, { type: "OPEN_DIALOG", dialog: "new-run" });
      expect(s.newRunForm.runner).toBe("");
      expect(s.newRunForm.model).toBe("");
    });
  });

  // ─── Kanban navigation ─────────────────────────────────────

  describe("kanban navigation state", () => {
    it("SET_FOCUSED_COLUMN updates column index", () => {
      const s = dispatch(initialUIState, { type: "SET_FOCUSED_COLUMN", index: 3 });
      expect(s.focusedColumnIndex).toBe(3);
    });

    it("SET_FOCUSED_ROW updates row index", () => {
      const s = dispatch(initialUIState, { type: "SET_FOCUSED_ROW", index: 2 });
      expect(s.focusedRowIndex).toBe(2);
    });

    it("SELECT_RUN updates selected run", () => {
      const s = dispatch(initialUIState, { type: "SELECT_RUN", runId: "abc" });
      expect(s.selectedRunId).toBe("abc");
    });

    it("SELECT_RUN null clears selection", () => {
      const withRun = dispatch(initialUIState, { type: "SELECT_RUN", runId: "abc" });
      const s = dispatch(withRun, { type: "SELECT_RUN", runId: null });
      expect(s.selectedRunId).toBeNull();
    });
  });

  // ─── Approval navigation ──────────────────────────────────

  describe("approval navigation", () => {
    it("SET_APPROVAL_INDEX updates index", () => {
      const s = dispatch(initialUIState, { type: "SET_APPROVAL_INDEX", index: 3 });
      expect(s.approvalIndex).toBe(3);
    });

    it("switching to approvals screen resets index", () => {
      const withIndex = dispatch(initialUIState, { type: "SET_APPROVAL_INDEX", index: 5 });
      const s = dispatch(withIndex, { type: "SET_SCREEN", screen: "approvals" });
      expect(s.approvalIndex).toBe(0);
    });
  });

  // ─── Log mode ──────────────────────────────────────────────

  describe("log mode", () => {
    it("defaults to structured", () => {
      expect(initialUIState.logMode).toBe("structured");
    });

    it("SET_LOG_MODE switches to raw", () => {
      const s = dispatch(initialUIState, { type: "SET_LOG_MODE", mode: "raw" });
      expect(s.logMode).toBe("raw");
    });

    it("SET_LOG_MODE switches back to structured", () => {
      const s = dispatch(initialUIState,
        { type: "SET_LOG_MODE", mode: "raw" },
        { type: "SET_LOG_MODE", mode: "structured" },
      );
      expect(s.logMode).toBe("structured");
    });
  });

  // ─── Input mode ────────────────────────────────────────────

  describe("input mode", () => {
    it("SET_INPUT_MODE toggles", () => {
      const s1 = dispatch(initialUIState, { type: "SET_INPUT_MODE", active: true });
      expect(s1.inputMode).toBe(true);

      const s2 = dispatch(s1, { type: "SET_INPUT_MODE", active: false });
      expect(s2.inputMode).toBe(false);
    });
  });

  // ─── Artifact diff toggle ─────────────────────────────────

  describe("artifact diff", () => {
    it("defaults to off", () => {
      expect(initialUIState.showArtifactDiff).toBe(false);
    });

    it("TOGGLE_ARTIFACT_DIFF toggles", () => {
      const s1 = dispatch(initialUIState, { type: "TOGGLE_ARTIFACT_DIFF" });
      expect(s1.showArtifactDiff).toBe(true);

      const s2 = dispatch(s1, { type: "TOGGLE_ARTIFACT_DIFF" });
      expect(s2.showArtifactDiff).toBe(false);
    });

    it("OPEN_RUN resets diff state", () => {
      const withDiff = dispatch(initialUIState, { type: "TOGGLE_ARTIFACT_DIFF" });
      const s = dispatch(withDiff, { type: "OPEN_RUN", runId: "r1" });
      expect(s.showArtifactDiff).toBe(false);
    });
  });

  // ─── Status messages ──────────────────────────────────────

  describe("status messages", () => {
    it("SET_STATUS sets message", () => {
      const s = dispatch(initialUIState, { type: "SET_STATUS", message: "hello" });
      expect(s.statusMessage).toBe("hello");
    });

    it("SET_STATUS null clears message", () => {
      const withMsg = dispatch(initialUIState, { type: "SET_STATUS", message: "hello" });
      const s = dispatch(withMsg, { type: "SET_STATUS", message: null });
      expect(s.statusMessage).toBeNull();
    });
  });

  // ─── Rework note ──────────────────────────────────────────

  describe("rework note", () => {
    it("SET_REWORK_NOTE updates note", () => {
      const s = dispatch(initialUIState, { type: "SET_REWORK_NOTE", value: "needs tests" });
      expect(s.reworkNote).toBe("needs tests");
    });
  });

  // ─── Complex navigation flows ─────────────────────────────

  describe("complex flows", () => {
    it("dashboard -> open run -> switch panes -> back to dashboard", () => {
      let s = initialUIState;

      // Open a run
      s = dispatch(s, { type: "OPEN_RUN", runId: "run-1" });
      expect(s.screen).toBe("run");
      expect(s.focusedPane).toBe("artifact");

      // Cycle through panes
      s = dispatch(s, { type: "NEXT_PANE" });
      expect(s.focusedPane).toBe("timeline");

      s = dispatch(s, { type: "NEXT_PANE" });
      expect(s.focusedPane).toBe("logs");

      // Switch log mode
      s = dispatch(s, { type: "SET_LOG_MODE", mode: "raw" });
      expect(s.logMode).toBe("raw");

      // Go back
      s = dispatch(s, { type: "BACK" });
      expect(s.screen).toBe("dashboard");
      expect(s.focusedPane).toBe("queue");
      // log mode persists
      expect(s.logMode).toBe("raw");
    });

    it("open rework dialog flow", () => {
      let s = dispatch(initialUIState, { type: "OPEN_RUN", runId: "run-1" });

      // Open rework dialog
      s = dispatch(s, { type: "OPEN_DIALOG", dialog: "rework" });
      expect(s.dialog).toBe("rework");
      expect(s.reworkNote).toBe("");

      // Type note
      s = dispatch(s, { type: "SET_REWORK_NOTE", value: "add error handling" });
      expect(s.reworkNote).toBe("add error handling");

      // Close dialog
      s = dispatch(s, { type: "CLOSE_DIALOG" });
      expect(s.dialog).toBeNull();
      expect(s.screen).toBe("run"); // still on run screen
    });

    it("new run dialog flow", () => {
      let s = initialUIState;

      s = dispatch(s, { type: "OPEN_DIALOG", dialog: "new-run" });
      expect(s.dialog).toBe("new-run");

      // Configure
      s = dispatch(s,
        { type: "SET_NEW_RUN_SOURCE_TYPE", sourceType: "pr" },
        { type: "SET_NEW_RUN_SOURCE_ID", value: "42" },
        { type: "SET_NEW_RUN_MODE", mode: "watch" },
      );
      expect(s.newRunForm).toEqual({ sourceType: "pr", sourceId: "42", mode: "watch", profile: "", runner: "", model: "", gateStrictness: "normal", priority: "normal" });

      // Cancel — Esc (BACK)
      s = dispatch(s, { type: "BACK" });
      expect(s.dialog).toBeNull();
      expect(s.screen).toBe("dashboard");
    });

    it("approvals -> open run -> back -> back to dashboard", () => {
      let s = dispatch(initialUIState, { type: "SET_SCREEN", screen: "approvals" });
      expect(s.screen).toBe("approvals");

      // Navigate in approvals
      s = dispatch(s, { type: "SET_APPROVAL_INDEX", index: 2 });

      // Open a run from approvals
      s = dispatch(s, { type: "OPEN_RUN", runId: "run-from-approval" });
      expect(s.screen).toBe("run");
      expect(s.selectedRunId).toBe("run-from-approval");

      // Back goes to dashboard (not approvals — BACK from run always goes dashboard)
      s = dispatch(s, { type: "BACK" });
      expect(s.screen).toBe("dashboard");
    });

    it("state does not leak between runs", () => {
      let s = dispatch(initialUIState, { type: "OPEN_RUN", runId: "r1" });
      s = dispatch(s,
        { type: "SET_LOG_MODE", mode: "raw" },
        { type: "TOGGLE_ARTIFACT_DIFF" },
        { type: "SET_FOCUSED_PANE", pane: "logs" },
      );

      // Open different run
      s = dispatch(s, { type: "OPEN_RUN", runId: "r2" });
      expect(s.selectedRunId).toBe("r2");
      expect(s.focusedPane).toBe("artifact"); // reset
      expect(s.showArtifactDiff).toBe(false); // reset
      // logMode persists — it's a user preference, not per-run
      expect(s.logMode).toBe("raw");
    });
  });

  // ─── Gate strictness and priority ──────────────────────────

  describe("gate strictness and priority", () => {
    it("SET_NEW_RUN_GATE_STRICTNESS changes gate strictness", () => {
      const s = dispatch(initialUIState, { type: "SET_NEW_RUN_GATE_STRICTNESS", gateStrictness: "strict" });
      expect(s.newRunForm.gateStrictness).toBe("strict");
    });

    it("SET_NEW_RUN_PRIORITY changes priority", () => {
      const s = dispatch(initialUIState, { type: "SET_NEW_RUN_PRIORITY", priority: "urgent" });
      expect(s.newRunForm.priority).toBe("urgent");
    });

    it("OPEN_DIALOG new-run resets gate strictness and priority", () => {
      const withData = {
        ...initialUIState,
        newRunForm: { ...initialUIState.newRunForm, gateStrictness: "strict" as const, priority: "high" as const },
      };
      const s = dispatch(withData, { type: "OPEN_DIALOG", dialog: "new-run" });
      expect(s.newRunForm.gateStrictness).toBe("normal");
      expect(s.newRunForm.priority).toBe("normal");
    });
  });

  // ─── Jump targets ──────────────────────────────────────────

  describe("jump targets", () => {
    it("JUMP_TO sets target and switches pane", () => {
      const s = dispatch(initialUIState, { type: "JUMP_TO", target: "latest_artifact" });
      expect(s.jumpTarget).toBe("latest_artifact");
      expect(s.focusedPane).toBe("artifact");
    });

    it("JUMP_TO latest_gate switches to timeline", () => {
      const s = dispatch(initialUIState, { type: "JUMP_TO", target: "latest_gate" });
      expect(s.jumpTarget).toBe("latest_gate");
      expect(s.focusedPane).toBe("timeline");
    });

    it("JUMP_TO last_error switches to timeline", () => {
      const s = dispatch(initialUIState, { type: "JUMP_TO", target: "last_error" });
      expect(s.jumpTarget).toBe("last_error");
      expect(s.focusedPane).toBe("timeline");
    });

    it("CLEAR_JUMP clears both jump and scroll", () => {
      const withJump = dispatch(initialUIState, { type: "JUMP_TO", target: "latest_gate" });
      const s = dispatch(withJump, { type: "CLEAR_JUMP" });
      expect(s.jumpTarget).toBeNull();
      expect(s.scrollToAgentRunId).toBeNull();
    });

    it("JUMP_TO_AGENT_RUN sets scroll target and timeline pane", () => {
      const s = dispatch(initialUIState, { type: "JUMP_TO_AGENT_RUN", agentRunId: "ar-123" });
      expect(s.scrollToAgentRunId).toBe("ar-123");
      expect(s.focusedPane).toBe("timeline");
      expect(s.jumpTarget).toBeNull();
    });
  });

  // ─── Unknown action ───────────────────────────────────────

  describe("unknown action", () => {
    it("returns state unchanged for unknown action type", () => {
      const s = uiReducer(initialUIState, { type: "NONEXISTENT" } as unknown as UIAction);
      expect(s).toEqual(initialUIState);
    });
  });
});
