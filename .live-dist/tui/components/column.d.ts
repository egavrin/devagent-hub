import type { WorkflowRun } from "../../state/types.js";
import type { LayoutMode } from "../hooks/use-layout.js";
interface ColumnProps {
    title: string;
    runs: WorkflowRun[];
    selectedRunId: string | null;
    activeRunId: string | null;
    isFocused: boolean;
    titleColor?: string;
    layoutMode?: LayoutMode;
}
export declare function Column({ title, runs, selectedRunId, activeRunId, isFocused, titleColor, layoutMode }: ColumnProps): import("react/jsx-runtime").JSX.Element;
export {};
