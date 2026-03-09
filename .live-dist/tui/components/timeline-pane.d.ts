import type { AgentRun, StatusTransition, Artifact } from "../../state/types.js";
import type { JumpTarget } from "../state.js";
interface TimelinePaneProps {
    agentRuns: AgentRun[];
    transitions: StatusTransition[];
    artifacts: Artifact[];
    isFocused: boolean;
    height: number;
    jumpTarget?: JumpTarget | null;
    scrollToAgentRunId?: string | null;
}
export declare function TimelinePane({ agentRuns, transitions, artifacts, isFocused, height, jumpTarget, scrollToAgentRunId }: TimelinePaneProps): import("react/jsx-runtime").JSX.Element;
export {};
