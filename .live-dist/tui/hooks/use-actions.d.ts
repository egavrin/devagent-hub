import type { WorkflowRun } from "../../state/types.js";
import type { Screen } from "../state.js";
import type { Action, ActionContext } from "../action-registry.js";
interface UseActionsOptions {
    screen: Screen;
    selectedRun: WorkflowRun | null;
    hasActiveProcess: boolean;
    hasConfig: boolean;
    autopilotRunning: boolean;
    handlers: Record<string, () => void>;
}
export interface ActionsResult {
    /** All registered actions */
    all: Action[];
    /** Actions available on the current screen + context */
    available: Action[];
    /** Actions for the command palette */
    palette: Action[];
    /** The single suggested next action, if any */
    suggested: Action | null;
    /** Current context */
    context: ActionContext;
    /** Execute an action by id */
    execute: (id: string) => void;
}
export declare function useActions(opts: UseActionsOptions): ActionsResult;
export {};
