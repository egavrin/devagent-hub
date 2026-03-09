import type { WorkflowRun } from "../../state/types.js";
interface RunCardPreviewProps {
    run: WorkflowRun | null;
}
/** Quick preview pane shown alongside the board in wide terminals (>140 cols) */
export declare function RunCardPreview({ run }: RunCardPreviewProps): import("react/jsx-runtime").JSX.Element;
export {};
