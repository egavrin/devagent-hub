import { useState, useEffect } from "react";
import type { WorkflowRun } from "../../state/types.js";
import type { StateStore } from "../../state/store.js";

export function useWorkflowRuns(store: StateStore, pollIntervalMs = 2000): WorkflowRun[] {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);

  useEffect(() => {
    const load = () => {
      setRuns(store.listAll());
    };
    load();
    const interval = setInterval(load, pollIntervalMs);
    return () => clearInterval(interval);
  }, [store, pollIntervalMs]);

  return runs;
}
