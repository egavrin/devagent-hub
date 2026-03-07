export type Screen = "dashboard" | "run" | "approvals";

export type FocusPane = "queue" | "artifact" | "timeline" | "logs";

export type LogMode = "structured" | "raw";

export interface UIState {
  screen: Screen;
  focusedPane: FocusPane;
  selectedRunId: string | null;
  logMode: LogMode;
  inputMode: boolean;
  newRunMode: boolean;
  newRunInput: string;
  focusedColumnIndex: number;
  focusedRowIndex: number;
  statusMessage: string | null;
}

export type UIAction =
  | { type: "SET_SCREEN"; screen: Screen }
  | { type: "SET_FOCUSED_PANE"; pane: FocusPane }
  | { type: "NEXT_PANE" }
  | { type: "PREV_PANE" }
  | { type: "SELECT_RUN"; runId: string | null }
  | { type: "SET_LOG_MODE"; mode: LogMode }
  | { type: "SET_INPUT_MODE"; active: boolean }
  | { type: "SET_NEW_RUN_MODE"; active: boolean }
  | { type: "SET_NEW_RUN_INPUT"; value: string }
  | { type: "SET_FOCUSED_COLUMN"; index: number }
  | { type: "SET_FOCUSED_ROW"; index: number }
  | { type: "SET_STATUS"; message: string | null }
  | { type: "OPEN_RUN"; runId: string }
  | { type: "BACK" };

const PANE_ORDER: FocusPane[] = ["queue", "artifact", "timeline", "logs"];

export const initialUIState: UIState = {
  screen: "dashboard",
  focusedPane: "queue",
  selectedRunId: null,
  logMode: "structured",
  inputMode: false,
  newRunMode: false,
  newRunInput: "",
  focusedColumnIndex: 0,
  focusedRowIndex: 0,
  statusMessage: null,
};

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "SET_SCREEN":
      return { ...state, screen: action.screen };

    case "SET_FOCUSED_PANE":
      return { ...state, focusedPane: action.pane };

    case "NEXT_PANE": {
      const idx = PANE_ORDER.indexOf(state.focusedPane);
      const next = PANE_ORDER[(idx + 1) % PANE_ORDER.length];
      return { ...state, focusedPane: next };
    }

    case "PREV_PANE": {
      const idx = PANE_ORDER.indexOf(state.focusedPane);
      const prev = PANE_ORDER[(idx - 1 + PANE_ORDER.length) % PANE_ORDER.length];
      return { ...state, focusedPane: prev };
    }

    case "SELECT_RUN":
      return { ...state, selectedRunId: action.runId };

    case "SET_LOG_MODE":
      return { ...state, logMode: action.mode };

    case "SET_INPUT_MODE":
      return { ...state, inputMode: action.active };

    case "SET_NEW_RUN_MODE":
      return action.active
        ? { ...state, newRunMode: true, newRunInput: "" }
        : { ...state, newRunMode: false, newRunInput: "" };

    case "SET_NEW_RUN_INPUT":
      return { ...state, newRunInput: action.value };

    case "SET_FOCUSED_COLUMN":
      return { ...state, focusedColumnIndex: action.index };

    case "SET_FOCUSED_ROW":
      return { ...state, focusedRowIndex: action.index };

    case "SET_STATUS":
      return { ...state, statusMessage: action.message };

    case "OPEN_RUN":
      return {
        ...state,
        screen: "run",
        selectedRunId: action.runId,
        focusedPane: "artifact",
      };

    case "BACK":
      if (state.newRunMode) {
        return { ...state, newRunMode: false, newRunInput: "" };
      }
      if (state.screen === "run") {
        return { ...state, screen: "dashboard", focusedPane: "queue" };
      }
      if (state.screen === "approvals") {
        return { ...state, screen: "dashboard", focusedPane: "queue" };
      }
      return state;

    default:
      return state;
  }
}
