import type { WorkflowMode } from "../../state/types.js";
interface SummaryBarProps {
    mode: WorkflowMode | null;
    runningCount: number;
    needsActionCount: number;
    blockedCount: number;
    failedCount: number;
    doneCount: number;
    totalCount: number;
    autopilotOn: boolean;
    activeRunners: number;
}
export declare function SummaryBar({ mode, runningCount, needsActionCount, blockedCount, failedCount, doneCount, totalCount, autopilotOn, activeRunners, }: SummaryBarProps): import("react/jsx-runtime").JSX.Element;
export {};
