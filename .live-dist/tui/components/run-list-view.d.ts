import type { WorkflowRun } from "../../state/types.js";
interface RunListViewProps {
    runs: WorkflowRun[];
    selectedRunId: string | null;
    activeRunId: string | null;
}
/** Single-column list for narrow terminals (<80 cols) */
export declare function RunListView({ runs, selectedRunId, activeRunId }: RunListViewProps): import("react/jsx-runtime").JSX.Element;
export {};
