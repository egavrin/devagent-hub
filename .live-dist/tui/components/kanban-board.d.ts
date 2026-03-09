import type { WorkflowRun } from "../../state/types.js";
import type { OperatorStatus } from "../status-map.js";
/** Operator bucket definitions */
export interface BucketDef {
    title: OperatorStatus;
    color: string;
    match: (run: WorkflowRun) => boolean;
}
export declare const OPERATOR_BUCKETS: BucketDef[];
interface KanbanBoardProps {
    runs: WorkflowRun[];
    selectedRunId: string | null;
    activeRunId: string | null;
    focusedColumnIndex: number;
    isFocused: boolean;
    compactMode?: boolean;
}
export declare function KanbanBoard({ runs, selectedRunId, activeRunId, focusedColumnIndex, isFocused, compactMode }: KanbanBoardProps): import("react/jsx-runtime").JSX.Element;
export {};
