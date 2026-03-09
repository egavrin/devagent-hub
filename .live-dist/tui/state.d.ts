export type Screen = "dashboard" | "run" | "approvals" | "runners" | "autopilot" | "settings";
export type FocusPane = "queue" | "artifact" | "timeline" | "logs";
export type DetailTab = "summary" | "timeline" | "artifacts" | "logs";
export type LogMode = "structured" | "raw" | "errors";
export type Dialog = null | "new-run" | "rework" | "command-palette" | "help" | "rerun";
export type NewRunSourceType = "issue" | "pr" | "project-brief";
export type NewRunMode = "assisted" | "watch" | "autopilot-once";
export type GateStrictness = "normal" | "strict" | "lenient";
export type RunPriority = "normal" | "high" | "urgent";
export interface NewRunForm {
    sourceType: NewRunSourceType;
    sourceId: string;
    mode: NewRunMode;
    profile: string;
    runner: string;
    model: string;
    gateStrictness: GateStrictness;
    priority: RunPriority;
}
export type JumpTarget = "latest_artifact" | "latest_gate" | "last_error";
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
    jumpTarget: JumpTarget | null;
    scrollToAgentRunId: string | null;
    detailTab: DetailTab;
}
export type UIAction = {
    type: "SET_SCREEN";
    screen: Screen;
} | {
    type: "SET_FOCUSED_PANE";
    pane: FocusPane;
} | {
    type: "NEXT_PANE";
} | {
    type: "PREV_PANE";
} | {
    type: "SELECT_RUN";
    runId: string | null;
} | {
    type: "SET_LOG_MODE";
    mode: LogMode;
} | {
    type: "SET_INPUT_MODE";
    active: boolean;
} | {
    type: "OPEN_DIALOG";
    dialog: Dialog;
} | {
    type: "CLOSE_DIALOG";
} | {
    type: "SET_NEW_RUN_SOURCE_TYPE";
    sourceType: NewRunSourceType;
} | {
    type: "SET_NEW_RUN_SOURCE_ID";
    value: string;
} | {
    type: "SET_NEW_RUN_MODE";
    mode: NewRunMode;
} | {
    type: "SET_NEW_RUN_PROFILE";
    profile: string;
} | {
    type: "SET_NEW_RUN_RUNNER";
    runner: string;
} | {
    type: "SET_NEW_RUN_MODEL";
    model: string;
} | {
    type: "SET_NEW_RUN_GATE_STRICTNESS";
    gateStrictness: GateStrictness;
} | {
    type: "SET_NEW_RUN_PRIORITY";
    priority: RunPriority;
} | {
    type: "JUMP_TO";
    target: JumpTarget;
} | {
    type: "CLEAR_JUMP";
} | {
    type: "JUMP_TO_AGENT_RUN";
    agentRunId: string;
} | {
    type: "SET_REWORK_NOTE";
    value: string;
} | {
    type: "SET_FOCUSED_COLUMN";
    index: number;
} | {
    type: "SET_FOCUSED_ROW";
    index: number;
} | {
    type: "SET_APPROVAL_INDEX";
    index: number;
} | {
    type: "SET_STATUS";
    message: string | null;
} | {
    type: "OPEN_RUN";
    runId: string;
} | {
    type: "TOGGLE_ARTIFACT_DIFF";
} | {
    type: "SET_FILTER";
    query: string;
} | {
    type: "TOGGLE_FILTER";
} | {
    type: "SET_RERUN_INDEX";
    index: number;
} | {
    type: "SET_DETAIL_TAB";
    tab: DetailTab;
} | {
    type: "NEXT_DETAIL_TAB";
} | {
    type: "PREV_DETAIL_TAB";
} | {
    type: "BACK";
};
export declare const initialUIState: UIState;
export declare function uiReducer(state: UIState, action: UIAction): UIState;
