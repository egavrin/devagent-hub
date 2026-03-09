import type { WorkflowRun } from "../../state/types.js";
import type { AgentEvent } from "../event-parser.js";
import type { OutputLine } from "../hooks/use-process-output.js";
import type { LogMode } from "../state.js";
interface LogPaneProps {
    selectedRun: WorkflowRun | null;
    logMode: LogMode;
    events: AgentEvent[];
    outputLines: OutputLine[];
    isFocused: boolean;
}
export declare function LogPane({ selectedRun, logMode, events, outputLines, isFocused }: LogPaneProps): import("react/jsx-runtime").JSX.Element;
export {};
