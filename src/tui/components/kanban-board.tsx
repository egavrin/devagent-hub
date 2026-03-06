import React from "react";
import { Box } from "ink";
import type { WorkflowRun, WorkflowStatus } from "../../state/types.js";
import { Column } from "./column.js";

export interface ColumnDef {
  title: string;
  statuses: WorkflowStatus[];
}

export const KANBAN_COLUMNS: ColumnDef[] = [
  { title: "Triage", statuses: ["new", "triaged"] },
  { title: "Planning", statuses: ["plan_draft", "plan_revision", "plan_accepted"] },
  { title: "Building", statuses: ["implementing", "awaiting_local_verify"] },
  { title: "Review", statuses: ["draft_pr_opened", "auto_review_fix_loop", "awaiting_human_review"] },
  { title: "Done", statuses: ["ready_to_merge", "done"] },
  { title: "Blocked", statuses: ["escalated", "failed"] },
];

interface KanbanBoardProps {
  runs: WorkflowRun[];
  selectedRunId: string | null;
  activeRunId: string | null;
  focusedColumnIndex: number;
  isFocused: boolean;
}

export function KanbanBoard({ runs, selectedRunId, activeRunId, focusedColumnIndex, isFocused }: KanbanBoardProps) {
  return (
    <Box flexDirection="row" width="100%">
      {KANBAN_COLUMNS.map((col, i) => {
        const columnRuns = runs.filter((r) => col.statuses.includes(r.status));
        return (
          <Column
            key={col.title}
            title={col.title}
            runs={columnRuns}
            selectedRunId={selectedRunId}
            activeRunId={activeRunId}
            isFocused={isFocused && i === focusedColumnIndex}
          />
        );
      })}
    </Box>
  );
}
