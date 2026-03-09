import type { Artifact, ApprovalRequest } from "../../state/types.js";
interface ArtifactPaneProps {
    artifacts: Artifact[];
    approvals: ApprovalRequest[];
    agentRuns?: import("../../state/types.js").AgentRun[];
    isFocused: boolean;
    height: number;
    showDiff?: boolean;
    onJumpToAgentRun?: (agentRunId: string) => void;
}
export declare function ArtifactPane({ artifacts, approvals, agentRuns, isFocused, height, showDiff, onJumpToAgentRun }: ArtifactPaneProps): import("react/jsx-runtime").JSX.Element;
export {};
