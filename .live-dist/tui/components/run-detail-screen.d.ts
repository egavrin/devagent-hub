import type { WorkflowRun, AgentRun, Artifact, ApprovalRequest, StatusTransition } from "../../state/types.js";
import type { DetailTab, JumpTarget } from "../state.js";
import type { OutputLine } from "../hooks/use-process-output.js";
interface RunDetailScreenProps {
    run: WorkflowRun;
    agentRuns: AgentRun[];
    artifacts: Artifact[];
    transitions: StatusTransition[];
    approvals: ApprovalRequest[];
    activeTab: DetailTab;
    onSelectTab: (tab: DetailTab) => void;
    isActive: boolean;
    termHeight: number;
    logMode: "structured" | "raw" | "errors";
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
}
export declare function RunDetailScreen({ run, agentRuns, artifacts, transitions, approvals, activeTab, onSelectTab, isActive, termHeight, logMode, logEvents, outputLines, showArtifactDiff, jumpTarget, scrollToAgentRunId, onJumpToAgentRun, }: RunDetailScreenProps): import("react/jsx-runtime").JSX.Element;
export {};
