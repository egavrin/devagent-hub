import React from "react";
import { Box, Text } from "ink";
import type { WorkflowRun } from "../../state/types.js";
import type { OperatorStatus } from "../status-map.js";
import { toOperatorStatus, operatorStatusColor } from "../status-map.js";
import { Column } from "./column.js";

/** Operator bucket definitions */
export interface BucketDef {
  title: OperatorStatus;
  color: string;
  match: (run: WorkflowRun) => boolean;
}

export const OPERATOR_BUCKETS: BucketDef[] = [
  {
    title: "Needs Action",
    color: "yellow",
    match: (r) => toOperatorStatus(r.status) === "Needs Action",
  },
  {
    title: "Running",
    color: "blue",
    match: (r) => toOperatorStatus(r.status) === "Running",
  },
  {
    title: "Queued",
    color: "gray",
    match: (r) => toOperatorStatus(r.status) === "Queued",
  },
  {
    title: "Waiting",
    color: "white",
    match: (r) => toOperatorStatus(r.status) === "Waiting",
  },
  {
    title: "Done",
    color: "green",
    match: (r) => toOperatorStatus(r.status) === "Done",
  },
  {
    title: "Blocked",
    color: "red",
    match: (r) => toOperatorStatus(r.status) === "Blocked",
  },
];

interface KanbanBoardProps {
  runs: WorkflowRun[];
  selectedRunId: string | null;
  activeRunId: string | null;
  focusedColumnIndex: number;
  isFocused: boolean;
  compactMode?: boolean;
}

export function KanbanBoard({ runs, selectedRunId, activeRunId, focusedColumnIndex, isFocused, compactMode = true }: KanbanBoardProps) {
  // Build bucket runs
  const bucketRuns = OPERATOR_BUCKETS.map((bucket) => ({
    bucket,
    runs: runs.filter(bucket.match),
  }));

  // In compact mode, filter out empty buckets but track collapsed ones
  const visibleBuckets = compactMode
    ? bucketRuns.filter((b) => b.runs.length > 0)
    : bucketRuns;

  const collapsedBuckets = compactMode
    ? bucketRuns.filter((b) => b.runs.length === 0)
    : [];

  // Map focusedColumnIndex to visible bucket index
  const clampedFocusIndex = Math.min(focusedColumnIndex, Math.max(0, visibleBuckets.length - 1));

  return (
    <Box flexDirection="column" width="100%">
      {/* Collapsed bucket badges */}
      {collapsedBuckets.length > 0 && (
        <Box paddingLeft={1} flexShrink={0}>
          {collapsedBuckets.map((b, i) => (
            <Text key={b.bucket.title} dimColor>
              {i > 0 ? "  " : ""}
              {b.bucket.title}(0)
            </Text>
          ))}
        </Box>
      )}
      {/* Visible columns */}
      <Box flexDirection="row" width="100%">
        {visibleBuckets.map((b, i) => (
          <Column
            key={b.bucket.title}
            title={b.bucket.title}
            runs={b.runs}
            selectedRunId={selectedRunId}
            activeRunId={activeRunId}
            isFocused={isFocused && i === clampedFocusIndex}
            titleColor={b.bucket.color}
          />
        ))}
        {visibleBuckets.length === 0 && (
          <Box padding={1}>
            <Text dimColor>No workflow runs yet — press N to start</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
