export type Screen = "dashboard" | "run" | "approvals" | "runners" | "autopilot" | "settings";

export type FocusPane = "queue" | "artifact" | "timeline" | "logs";

export type LogMode = "structured" | "raw" | "errors";

export type Dialog = null | "new-run" | "rework" | "command-palette" | "help" | "rerun";

export type NewRunSourceType = "issue" | "pr";
export type NewRunMode = "assisted" | "watch";

export interface NewRunForm {
  sourceType: NewRunSourceType;
  sourceId: string;
  mode: NewRunMode;
  profile: string;  // selected profile name, empty = default
}

export interface UIState {
  screen: Screen;
  focusedPane: FocusPane;
  selectedRunId: string | null;
  logMode: LogMode;
  inputMode: boolean;
  dialog: Dialog;
  newRunForm: NewRunForm;
  reworkNote: string;
  focusedColumnIndex: number;
  focusedRowIndex: number;
  approvalIndex: number;
  statusMessage: string | null;
  showArtifactDiff: boolean;
  filterQuery: string;
  filterActive: boolean;
  rerunProfileIndex: number;
}

export type UIAction =
  | { type: "SET_SCREEN"; screen: Screen }
  | { type: "SET_FOCUSED_PANE"; pane: FocusPane }
  | { type: "NEXT_PANE" }
  | { type: "PREV_PANE" }
  | { type: "SELECT_RUN"; runId: string | null }
  | { type: "SET_LOG_MODE"; mode: LogMode }
  | { type: "SET_INPUT_MODE"; active: boolean }
  | { type: "OPEN_DIALOG"; dialog: Dialog }
  | { type: "CLOSE_DIALOG" }
  | { type: "SET_NEW_RUN_SOURCE_TYPE"; sourceType: NewRunSourceType }
  | { type: "SET_NEW_RUN_SOURCE_ID"; value: string }
  | { type: "SET_NEW_RUN_MODE"; mode: NewRunMode }
  | { type: "SET_NEW_RUN_PROFILE"; profile: string }
  | { type: "SET_REWORK_NOTE"; value: string }
  | { type: "SET_FOCUSED_COLUMN"; index: number }
  | { type: "SET_FOCUSED_ROW"; index: number }
  | { type: "SET_APPROVAL_INDEX"; index: number }
  | { type: "SET_STATUS"; message: string | null }
  | { type: "OPEN_RUN"; runId: string }
  | { type: "TOGGLE_ARTIFACT_DIFF" }
  | { type: "SET_FILTER"; query: string }
  | { type: "TOGGLE_FILTER" }
  | { type: "SET_RERUN_INDEX"; index: number }
  | { type: "BACK" };

const PANE_ORDER: FocusPane[] = ["queue", "artifact", "timeline", "logs"];

export const initialUIState: UIState = {
  screen: "dashboard",
  focusedPane: "queue",
  selectedRunId: null,
  logMode: "structured",
  inputMode: false,
  dialog: null,
  newRunForm: { sourceType: "issue", sourceId: "", mode: "assisted", profile: "" },
  reworkNote: "",
  focusedColumnIndex: 0,
  focusedRowIndex: 0,
  approvalIndex: 0,
  statusMessage: null,
  showArtifactDiff: false,
  filterQuery: "",
  filterActive: false,
  rerunProfileIndex: 0,
};

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "SET_SCREEN":
      return { ...state, screen: action.screen, approvalIndex: 0 };

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

    case "OPEN_DIALOG":
      return {
        ...state,
        dialog: action.dialog,
        ...(action.dialog === "new-run"
          ? { newRunForm: { sourceType: "issue", sourceId: "", mode: "assisted", profile: "" } }
          : {}),
        ...(action.dialog === "rework" ? { reworkNote: "" } : {}),
        ...(action.dialog === "rerun" ? { rerunProfileIndex: 0 } : {}),
      };

    case "CLOSE_DIALOG":
      return { ...state, dialog: null };

    case "SET_NEW_RUN_SOURCE_TYPE":
      return { ...state, newRunForm: { ...state.newRunForm, sourceType: action.sourceType } };

    case "SET_NEW_RUN_SOURCE_ID":
      return { ...state, newRunForm: { ...state.newRunForm, sourceId: action.value } };

    case "SET_NEW_RUN_MODE":
      return { ...state, newRunForm: { ...state.newRunForm, mode: action.mode } };

    case "SET_NEW_RUN_PROFILE":
      return { ...state, newRunForm: { ...state.newRunForm, profile: action.profile } };

    case "SET_REWORK_NOTE":
      return { ...state, reworkNote: action.value };

    case "SET_FOCUSED_COLUMN":
      return { ...state, focusedColumnIndex: action.index };

    case "SET_FOCUSED_ROW":
      return { ...state, focusedRowIndex: action.index };

    case "SET_APPROVAL_INDEX":
      return { ...state, approvalIndex: action.index };

    case "SET_STATUS":
      return { ...state, statusMessage: action.message };

    case "TOGGLE_ARTIFACT_DIFF":
      return { ...state, showArtifactDiff: !state.showArtifactDiff };

    case "SET_FILTER":
      return { ...state, filterQuery: action.query };

    case "SET_RERUN_INDEX":
      return { ...state, rerunProfileIndex: action.index };

    case "TOGGLE_FILTER":
      return state.filterActive
        ? { ...state, filterActive: false, filterQuery: "" }
        : { ...state, filterActive: true };

    case "OPEN_RUN":
      return {
        ...state,
        screen: "run",
        selectedRunId: action.runId,
        focusedPane: "artifact",
        dialog: null,
        showArtifactDiff: false,
      };

    case "BACK":
      if (state.dialog) {
        return { ...state, dialog: null };
      }
      if (state.screen === "run") {
        return { ...state, screen: "dashboard", focusedPane: "queue" };
      }
      if (state.screen === "approvals") {
        return { ...state, screen: "dashboard", focusedPane: "queue" };
      }
      if (state.screen === "runners") {
        return { ...state, screen: "dashboard", focusedPane: "queue" };
      }
      if (state.screen === "autopilot") {
        return { ...state, screen: "dashboard", focusedPane: "queue" };
      }
      if (state.screen === "settings") {
        return { ...state, screen: "dashboard", focusedPane: "queue" };
      }
      return state;

    default:
      return state;
  }
}
