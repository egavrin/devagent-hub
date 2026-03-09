import type { WorkflowRun } from "../../state/types.js";
import type { LayoutMode } from "../hooks/use-layout.js";
interface RunCardProps {
    run: WorkflowRun;
    isSelected: boolean;
    isActive: boolean;
    layoutMode?: LayoutMode;
}
export declare function RunCard({ run, isSelected, isActive, layoutMode }: RunCardProps): import("react/jsx-runtime").JSX.Element;
export {};
