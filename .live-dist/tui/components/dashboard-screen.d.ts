import type { WorkflowRun } from "../../state/types.js";
import type { ProcessRegistry } from "../../runner/process-registry.js";
import type { WorkflowConfig } from "../../workflow/config.js";
import type { LayoutMode } from "../hooks/use-layout.js";
interface DashboardScreenProps {
    runs: WorkflowRun[];
    filteredRuns: WorkflowRun[];
    selectedRunId: string | null;
    activeProcessId: string | null;
    focusedColumnIndex: number;
    autopilotRunning: boolean;
    autopilotStats: {
        lastPoll: string | null;
        activeCount: number;
        totalDispatched: number;
    };
    registry: ProcessRegistry;
    config?: WorkflowConfig;
    filterActive: boolean;
    filterQuery: string;
    onFilterChange: (query: string) => void;
    store: {
        getRecentAgentRuns: (limit?: number) => {
            costUsd?: number | null;
        }[];
    };
    layoutMode: LayoutMode;
    previewWidth: number;
}
export declare function DashboardScreen({ runs, filteredRuns, selectedRunId, activeProcessId, focusedColumnIndex, autopilotRunning, autopilotStats, registry, config, filterActive, filterQuery, onFilterChange, store, layoutMode, previewWidth, }: DashboardScreenProps): import("react/jsx-runtime").JSX.Element;
export {};
