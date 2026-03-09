import type { WorkflowRun, AgentRun, Artifact, ApprovalRequest, StatusTransition } from "../../state/types.js";
import type { ProcessRegistry } from "../../runner/process-registry.js";
import type { WorkflowConfig } from "../../workflow/config.js";
import type { Screen, DetailTab, JumpTarget, LogMode } from "../state.js";
import type { OutputLine } from "../hooks/use-process-output.js";
import type { ApprovalQueueItem } from "./approval-queue-view.js";
import type { RunnerInfo } from "./runners-view.js";
interface ScreenRouterProps {
    screen: Screen;
    termHeight: number;
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
    selectedRun: WorkflowRun | null;
    agentRuns: AgentRun[];
    artifacts: Artifact[];
    transitions: StatusTransition[];
    approvals: ApprovalRequest[];
    detailTab: DetailTab;
    onSelectDetailTab: (tab: DetailTab) => void;
    logMode: LogMode;
    logEvents: {
        timestamp: string;
        type: "output";
        summary: string;
    }[];
    outputLines: OutputLine[];
    showArtifactDiff: boolean;
    jumpTarget: JumpTarget | null;
    scrollToAgentRunId: string | null;
    onJumpToAgentRun: (agentRunId: string) => void;
    approvalQueueItems: ApprovalQueueItem[];
    planRevisionRuns: WorkflowRun[];
    escalatedRuns: WorkflowRun[];
    failedRuns: WorkflowRun[];
    awaitingReviewRuns: WorkflowRun[];
    readyToMergeRuns: WorkflowRun[];
    approvalIndex: number;
    runnerInfos: RunnerInfo[];
    recentAgentRuns: AgentRun[];
}
export declare function ScreenRouter(props: ScreenRouterProps): import("react/jsx-runtime").JSX.Element;
export {};
