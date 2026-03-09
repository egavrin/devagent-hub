import type { WorkflowRun, Artifact, StatusTransition, AgentRun, ApprovalRequest } from "../../state/types.js";
interface SummaryTabProps {
    run: WorkflowRun;
    artifacts: Artifact[];
    transitions: StatusTransition[];
    agentRuns: AgentRun[];
    approvals: ApprovalRequest[];
    isActive: boolean;
    height: number;
}
export declare function SummaryTab({ run, artifacts, transitions, agentRuns, approvals, isActive, height }: SummaryTabProps): import("react/jsx-runtime").JSX.Element;
export {};
