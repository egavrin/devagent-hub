import type { WorkflowConfig } from "../../workflow/config.js";
import type { WorkflowRun } from "../../state/types.js";
interface AutopilotViewProps {
    config: WorkflowConfig | undefined;
    runs: WorkflowRun[];
    autopilotRunning: boolean;
    stats: {
        lastPoll: string | null;
        activeCount: number;
        totalDispatched: number;
    };
    height: number;
    eligibleIssues?: Array<{
        number: number;
        title: string;
        labels: string[];
    }>;
    skippedIssues?: Array<{
        number: number;
        title: string;
        reason: string;
    }>;
}
export declare function AutopilotView({ config, runs, autopilotRunning, stats, height, eligibleIssues, skippedIssues }: AutopilotViewProps): import("react/jsx-runtime").JSX.Element;
export {};
