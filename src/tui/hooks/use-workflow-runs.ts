import { useState, useEffect } from "react";
import type { WorkflowRun, WorkflowStatus } from "../../state/types.js";
import type { StateStore } from "../../state/store.js";

const ALL_STATUSES: WorkflowStatus[] = [
  "new", "triaged", "plan_draft", "plan_revision", "plan_accepted",
  "implementing", "awaiting_local_verify", "draft_pr_opened",
  "auto_review_fix_loop", "awaiting_human_review", "ready_to_merge",
  "done", "escalated", "failed",
];

export function useWorkflowRuns(store: StateStore, pollIntervalMs = 2000): WorkflowRun[] {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);

  useEffect(() => {
    const load = () => {
      const all: WorkflowRun[] = [];
      for (const status of ALL_STATUSES) {
        all.push(...store.listByStatus(status));
      }
      setRuns(all);
    };
    load();
    const interval = setInterval(load, pollIntervalMs);
    return () => clearInterval(interval);
  }, [store, pollIntervalMs]);

  return runs;
}
