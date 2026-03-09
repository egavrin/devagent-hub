import type { WorkflowRun } from "../../state/types.js";
import type { StateStore } from "../../state/store.js";
export declare function useWorkflowRuns(store: StateStore, pollIntervalMs?: number): WorkflowRun[];
