import { describe, it, expect } from "vitest";
import { uiReducer, initialUIState } from "../tui/state.js";
import type { UIState, UIAction } from "../tui/state.js";

/** Helper: apply a sequence of actions to produce the final state. */
function applyActions(state: UIState, actions: UIAction[]): UIState {
  return actions.reduce((s, a) => uiReducer(s, a), state);
}

// ─── 1. Dashboard → Run navigation flow ────────────────────

describe("Dashboard → Run navigation flow", () => {
  it("OPEN_RUN switches to run screen with artifact pane focused", () => {
    const state = uiReducer(initialUIState, { type: "OPEN_RUN", runId: "run-1" });
    expect(state.screen).toBe("run");
    expect(state.focusedPane).toBe("artifact");
    expect(state.selectedRunId).toBe("run-1");
    expect(state.dialog).toBeNull();
    expect(state.showArtifactDiff).toBe(false);
  });

  it("BACK from run returns to dashboard with queue pane", () => {
    const state = applyActions(initialUIState, [
      { type: "OPEN_RUN", runId: "run-1" },
      { type: "BACK" },
    ]);
    expect(state.screen).toBe("dashboard");
    expect(state.focusedPane).toBe("queue");
  });
});

// ─── 2. Approval queue flow ────────────────────────────────

describe("Approval queue flow", () => {
  it("navigates to approvals and moves through items", () => {
    let state = uiReducer(initialUIState, { type: "SET_SCREEN", screen: "approvals" });
    expect(state.screen).toBe("approvals");
    expect(state.approvalIndex).toBe(0);

    state = uiReducer(state, { type: "SET_APPROVAL_INDEX", index: 3 });
    expect(state.approvalIndex).toBe(3);

    state = uiReducer(state, { type: "SET_APPROVAL_INDEX", index: 1 });
    expect(state.approvalIndex).toBe(1);
  });

  it("BACK from approvals returns to dashboard", () => {
    const state = applyActions(initialUIState, [
      { type: "SET_SCREEN", screen: "approvals" },
      { type: "BACK" },
    ]);
    expect(state.screen).toBe("dashboard");
  });
});

// ─── 3. New run dialog flow ────────────────────────────────

describe("New run dialog flow", () => {
  it("opens with reset form defaults", () => {
    const state = uiReducer(initialUIState, { type: "OPEN_DIALOG", dialog: "new-run" });
    expect(state.dialog).toBe("new-run");
    expect(state.newRunForm).toEqual({
      sourceType: "issue",
      sourceId: "",
      mode: "assisted",
      profile: "",
      runner: "",
      model: "",
    });
  });

  it("updates source type to pr", () => {
    const state = applyActions(initialUIState, [
      { type: "OPEN_DIALOG", dialog: "new-run" },
      { type: "SET_NEW_RUN_SOURCE_TYPE", sourceType: "pr" },
    ]);
    expect(state.newRunForm.sourceType).toBe("pr");
  });

  it("updates mode to watch", () => {
    const state = applyActions(initialUIState, [
      { type: "OPEN_DIALOG", dialog: "new-run" },
      { type: "SET_NEW_RUN_MODE", mode: "watch" },
    ]);
    expect(state.newRunForm.mode).toBe("watch");
  });

  it("updates source id", () => {
    const state = applyActions(initialUIState, [
      { type: "OPEN_DIALOG", dialog: "new-run" },
      { type: "SET_NEW_RUN_SOURCE_ID", value: "123" },
    ]);
    expect(state.newRunForm.sourceId).toBe("123");
  });

  it("CLOSE_DIALOG clears dialog", () => {
    const state = applyActions(initialUIState, [
      { type: "OPEN_DIALOG", dialog: "new-run" },
      { type: "CLOSE_DIALOG" },
    ]);
    expect(state.dialog).toBeNull();
  });

  it("resets form when reopened", () => {
    const state = applyActions(initialUIState, [
      { type: "OPEN_DIALOG", dialog: "new-run" },
      { type: "SET_NEW_RUN_SOURCE_TYPE", sourceType: "pr" },
      { type: "SET_NEW_RUN_SOURCE_ID", value: "456" },
      { type: "SET_NEW_RUN_MODE", mode: "watch" },
      { type: "CLOSE_DIALOG" },
      { type: "OPEN_DIALOG", dialog: "new-run" },
    ]);
    expect(state.newRunForm).toEqual({
      sourceType: "issue",
      sourceId: "",
      mode: "assisted",
      profile: "",
      runner: "",
      model: "",
    });
  });
});

// ─── 4. Rework dialog flow ─────────────────────────────────

describe("Rework dialog flow", () => {
  it("opens with empty rework note", () => {
    const state = uiReducer(initialUIState, { type: "OPEN_DIALOG", dialog: "rework" });
    expect(state.dialog).toBe("rework");
    expect(state.reworkNote).toBe("");
  });

  it("updates rework note", () => {
    const state = applyActions(initialUIState, [
      { type: "OPEN_DIALOG", dialog: "rework" },
      { type: "SET_REWORK_NOTE", value: "Please fix X" },
    ]);
    expect(state.reworkNote).toBe("Please fix X");
  });

  it("CLOSE_DIALOG clears dialog", () => {
    const state = applyActions(initialUIState, [
      { type: "OPEN_DIALOG", dialog: "rework" },
      { type: "SET_REWORK_NOTE", value: "Please fix X" },
      { type: "CLOSE_DIALOG" },
    ]);
    expect(state.dialog).toBeNull();
  });

  it("resets rework note when reopened", () => {
    const state = applyActions(initialUIState, [
      { type: "OPEN_DIALOG", dialog: "rework" },
      { type: "SET_REWORK_NOTE", value: "old note" },
      { type: "CLOSE_DIALOG" },
      { type: "OPEN_DIALOG", dialog: "rework" },
    ]);
    expect(state.reworkNote).toBe("");
  });
});

// ─── 5. Pane cycling ───────────────────────────────────────

describe("Pane cycling", () => {
  it("NEXT_PANE cycles forward through all panes", () => {
    let state: UIState = { ...initialUIState, focusedPane: "queue" };

    state = uiReducer(state, { type: "NEXT_PANE" });
    expect(state.focusedPane).toBe("artifact");

    state = uiReducer(state, { type: "NEXT_PANE" });
    expect(state.focusedPane).toBe("timeline");

    state = uiReducer(state, { type: "NEXT_PANE" });
    expect(state.focusedPane).toBe("logs");

    state = uiReducer(state, { type: "NEXT_PANE" });
    expect(state.focusedPane).toBe("queue");
  });

  it("PREV_PANE cycles backward through all panes", () => {
    let state: UIState = { ...initialUIState, focusedPane: "queue" };

    state = uiReducer(state, { type: "PREV_PANE" });
    expect(state.focusedPane).toBe("logs");

    state = uiReducer(state, { type: "PREV_PANE" });
    expect(state.focusedPane).toBe("timeline");

    state = uiReducer(state, { type: "PREV_PANE" });
    expect(state.focusedPane).toBe("artifact");

    state = uiReducer(state, { type: "PREV_PANE" });
    expect(state.focusedPane).toBe("queue");
  });
});

// ─── 6. Filter flow ────────────────────────────────────────

describe("Filter flow", () => {
  it("TOGGLE_FILTER activates filter", () => {
    const state = uiReducer(initialUIState, { type: "TOGGLE_FILTER" });
    expect(state.filterActive).toBe(true);
  });

  it("SET_FILTER updates query", () => {
    const state = applyActions(initialUIState, [
      { type: "TOGGLE_FILTER" },
      { type: "SET_FILTER", query: "bug" },
    ]);
    expect(state.filterActive).toBe(true);
    expect(state.filterQuery).toBe("bug");
  });

  it("TOGGLE_FILTER again deactivates and clears query", () => {
    const state = applyActions(initialUIState, [
      { type: "TOGGLE_FILTER" },
      { type: "SET_FILTER", query: "bug" },
      { type: "TOGGLE_FILTER" },
    ]);
    expect(state.filterActive).toBe(false);
    expect(state.filterQuery).toBe("");
  });
});

// ─── 7. Command palette flow ───────────────────────────────

describe("Command palette flow", () => {
  it("opens command palette dialog", () => {
    const state = uiReducer(initialUIState, { type: "OPEN_DIALOG", dialog: "command-palette" });
    expect(state.dialog).toBe("command-palette");
  });

  it("BACK closes dialog instead of navigating", () => {
    const state = applyActions(initialUIState, [
      { type: "OPEN_DIALOG", dialog: "command-palette" },
      { type: "BACK" },
    ]);
    expect(state.dialog).toBeNull();
    expect(state.screen).toBe("dashboard");
  });

  it("BACK when dialog is open closes dialog, does not change screen", () => {
    // Open run, then open command palette, then BACK
    const state = applyActions(initialUIState, [
      { type: "OPEN_RUN", runId: "run-1" },
      { type: "OPEN_DIALOG", dialog: "command-palette" },
      { type: "BACK" },
    ]);
    // Dialog should be closed but still on run screen
    expect(state.dialog).toBeNull();
    expect(state.screen).toBe("run");
  });
});

// ─── 8. Help dialog flow ───────────────────────────────────

describe("Help dialog flow", () => {
  it("opens help dialog", () => {
    const state = uiReducer(initialUIState, { type: "OPEN_DIALOG", dialog: "help" });
    expect(state.dialog).toBe("help");
  });

  it("BACK closes help dialog", () => {
    const state = applyActions(initialUIState, [
      { type: "OPEN_DIALOG", dialog: "help" },
      { type: "BACK" },
    ]);
    expect(state.dialog).toBeNull();
    expect(state.screen).toBe("dashboard");
  });
});

// ─── 9. Screen navigation ──────────────────────────────────

describe("Screen navigation", () => {
  it("SET_SCREEN to runners and BACK returns to dashboard", () => {
    const state = applyActions(initialUIState, [
      { type: "SET_SCREEN", screen: "runners" },
    ]);
    expect(state.screen).toBe("runners");

    const back = uiReducer(state, { type: "BACK" });
    expect(back.screen).toBe("dashboard");
  });

  it("SET_SCREEN to autopilot and BACK returns to dashboard", () => {
    const state = applyActions(initialUIState, [
      { type: "SET_SCREEN", screen: "autopilot" },
    ]);
    expect(state.screen).toBe("autopilot");

    const back = uiReducer(state, { type: "BACK" });
    expect(back.screen).toBe("dashboard");
  });

  it("SET_SCREEN resets approval index", () => {
    let state: UIState = { ...initialUIState, approvalIndex: 5 };
    state = uiReducer(state, { type: "SET_SCREEN", screen: "approvals" });
    expect(state.approvalIndex).toBe(0);
  });

  it("BACK on dashboard is a no-op", () => {
    const state = uiReducer(initialUIState, { type: "BACK" });
    expect(state.screen).toBe("dashboard");
    expect(state).toEqual(initialUIState);
  });
});

// ─── 10. Log mode switching ────────────────────────────────

describe("Log mode switching", () => {
  it("switches to raw mode", () => {
    const state = uiReducer(initialUIState, { type: "SET_LOG_MODE", mode: "raw" });
    expect(state.logMode).toBe("raw");
  });

  it("switches to structured mode", () => {
    const state = applyActions(initialUIState, [
      { type: "SET_LOG_MODE", mode: "raw" },
      { type: "SET_LOG_MODE", mode: "structured" },
    ]);
    expect(state.logMode).toBe("structured");
  });
});

// ─── 11. Pane shortcuts ────────────────────────────────────

describe("Pane shortcuts", () => {
  it("SET_FOCUSED_PANE to logs", () => {
    const state = uiReducer(initialUIState, { type: "SET_FOCUSED_PANE", pane: "logs" });
    expect(state.focusedPane).toBe("logs");
  });

  it("SET_FOCUSED_PANE to timeline", () => {
    const state = uiReducer(initialUIState, { type: "SET_FOCUSED_PANE", pane: "timeline" });
    expect(state.focusedPane).toBe("timeline");
  });

  it("SET_FOCUSED_PANE to artifact", () => {
    const state = uiReducer(initialUIState, { type: "SET_FOCUSED_PANE", pane: "artifact" });
    expect(state.focusedPane).toBe("artifact");
  });

  it("SET_FOCUSED_PANE to queue", () => {
    const state = uiReducer(initialUIState, { type: "SET_FOCUSED_PANE", pane: "queue" });
    expect(state.focusedPane).toBe("queue");
  });
});

// ─── 12. Kanban navigation ─────────────────────────────────

describe("Kanban navigation", () => {
  it("SET_FOCUSED_COLUMN updates column index", () => {
    const state = uiReducer(initialUIState, { type: "SET_FOCUSED_COLUMN", index: 2 });
    expect(state.focusedColumnIndex).toBe(2);
  });

  it("SET_FOCUSED_ROW updates row index", () => {
    const state = uiReducer(initialUIState, { type: "SET_FOCUSED_ROW", index: 1 });
    expect(state.focusedRowIndex).toBe(1);
  });

  it("column and row navigation in sequence", () => {
    const state = applyActions(initialUIState, [
      { type: "SET_FOCUSED_COLUMN", index: 3 },
      { type: "SET_FOCUSED_ROW", index: 2 },
    ]);
    expect(state.focusedColumnIndex).toBe(3);
    expect(state.focusedRowIndex).toBe(2);
  });
});

// ─── 13. Artifact diff toggle ──────────────────────────────

describe("Artifact diff toggle", () => {
  it("toggles diff on", () => {
    const state = uiReducer(initialUIState, { type: "TOGGLE_ARTIFACT_DIFF" });
    expect(state.showArtifactDiff).toBe(true);
  });

  it("toggles diff off", () => {
    const state = applyActions(initialUIState, [
      { type: "TOGGLE_ARTIFACT_DIFF" },
      { type: "TOGGLE_ARTIFACT_DIFF" },
    ]);
    expect(state.showArtifactDiff).toBe(false);
  });

  it("OPEN_RUN resets diff to false", () => {
    const state = applyActions(initialUIState, [
      { type: "TOGGLE_ARTIFACT_DIFF" },
      { type: "OPEN_RUN", runId: "run-1" },
    ]);
    expect(state.showArtifactDiff).toBe(false);
  });
});

// ─── 14. Multiple BACK in sequence ─────────────────────────

describe("Multiple BACK in sequence", () => {
  it("first BACK closes dialog, second BACK navigates to dashboard", () => {
    // Navigate to run screen, open a dialog
    let state = applyActions(initialUIState, [
      { type: "OPEN_RUN", runId: "run-1" },
      { type: "OPEN_DIALOG", dialog: "help" },
    ]);
    expect(state.screen).toBe("run");
    expect(state.dialog).toBe("help");

    // First BACK: closes dialog, stays on run screen
    state = uiReducer(state, { type: "BACK" });
    expect(state.dialog).toBeNull();
    expect(state.screen).toBe("run");

    // Second BACK: navigates back to dashboard
    state = uiReducer(state, { type: "BACK" });
    expect(state.screen).toBe("dashboard");
    expect(state.focusedPane).toBe("queue");
  });

  it("dialog BACK priority applies for all dialog types", () => {
    for (const dialog of ["new-run", "rework", "command-palette", "help", "rerun"] as const) {
      const state = applyActions(initialUIState, [
        { type: "OPEN_RUN", runId: "run-1" },
        { type: "OPEN_DIALOG", dialog },
        { type: "BACK" },
      ]);
      expect(state.dialog).toBeNull();
      expect(state.screen).toBe("run");
    }
  });

  it("multiple BACK from deep navigation: approvals → dialog → back → back", () => {
    let state = applyActions(initialUIState, [
      { type: "SET_SCREEN", screen: "approvals" },
      { type: "OPEN_DIALOG", dialog: "command-palette" },
    ]);
    expect(state.screen).toBe("approvals");
    expect(state.dialog).toBe("command-palette");

    // First BACK closes dialog
    state = uiReducer(state, { type: "BACK" });
    expect(state.dialog).toBeNull();
    expect(state.screen).toBe("approvals");

    // Second BACK returns to dashboard
    state = uiReducer(state, { type: "BACK" });
    expect(state.screen).toBe("dashboard");
  });
});
