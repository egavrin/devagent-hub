import type { WorkflowConfig } from "../../workflow/config.js";
import type { WorkflowRun, AgentRun } from "../../state/types.js";
export interface RunnerInfo {
    bin: string;
    version: string | null;
    supportedPhases: string[];
    availableProviders: string[];
    supportedApprovalModes: string[];
    mcpServers: string[];
    tools: string[];
    healthy: boolean;
}
interface RunnersViewProps {
    config: WorkflowConfig;
    runs?: WorkflowRun[];
    agentRuns?: AgentRun[];
    runnerInfos?: RunnerInfo[];
    height: number;
}
export declare function RunnersView({ config, runs, agentRuns, runnerInfos, height }: RunnersViewProps): import("react/jsx-runtime").JSX.Element;
export {};
