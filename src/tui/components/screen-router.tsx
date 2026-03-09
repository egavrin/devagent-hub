import React from "react";
import type { WorkflowRun, AgentRun, Artifact, ApprovalRequest, StatusTransition } from "../../state/types.js";
import type { ProcessRegistry } from "../../runner/process-registry.js";
import type { WorkflowConfig } from "../../workflow/config.js";
import type { Screen, DetailTab, JumpTarget, LogMode } from "../state.js";
import type { OutputLine } from "../hooks/use-process-output.js";
import { useLayout } from "../hooks/use-layout.js";
import type { ApprovalQueueItem } from "./approval-queue-view.js";
import type { RunnerInfo } from "./runners-view.js";
import { DashboardScreen } from "./dashboard-screen.js";
import { RunDetailScreen } from "./run-detail-screen.js";
import { ApprovalQueueView } from "./approval-queue-view.js";
import { RunnersView } from "./runners-view.js";
import { AutopilotView } from "./autopilot-view.js";
import { SettingsView } from "./settings-view.js";

interface ScreenRouterProps {
  screen: Screen;
  termHeight: number;

  // Dashboard
  runs: WorkflowRun[];
  filteredRuns: WorkflowRun[];
  selectedRunId: string | null;
  activeProcessId: string | null;
  focusedColumnIndex: number;
  autopilotRunning: boolean;
  autopilotStats: { lastPoll: string | null; activeCount: number; totalDispatched: number };
  registry: ProcessRegistry;
  config?: WorkflowConfig;
  filterActive: boolean;
  filterQuery: string;
  onFilterChange: (query: string) => void;
  store: { getRecentAgentRuns: (limit?: number) => { costUsd?: number | null }[] };

  // Run detail
  selectedRun: WorkflowRun | null;
  agentRuns: AgentRun[];
  artifacts: Artifact[];
  transitions: StatusTransition[];
  approvals: ApprovalRequest[];
  detailTab: DetailTab;
  onSelectDetailTab: (tab: DetailTab) => void;
  logMode: LogMode;
  logEvents: { timestamp: string; type: "output"; summary: string }[];
  outputLines: OutputLine[];
  showArtifactDiff: boolean;
  jumpTarget: JumpTarget | null;
  scrollToAgentRunId: string | null;
  onJumpToAgentRun: (agentRunId: string) => void;

  // Approvals
  approvalQueueItems: ApprovalQueueItem[];
  planRevisionRuns: WorkflowRun[];
  escalatedRuns: WorkflowRun[];
  failedRuns: WorkflowRun[];
  awaitingReviewRuns: WorkflowRun[];
  readyToMergeRuns: WorkflowRun[];
  approvalIndex: number;

  // Runners
  runnerInfos: RunnerInfo[];
  recentAgentRuns: AgentRun[];

  // Autopilot (reuses autopilotRunning, autopilotStats, config, runs from above)
}

export function ScreenRouter(props: ScreenRouterProps) {
  const { screen, termHeight } = props;
  const layout = useLayout();

  if (screen === "run" && props.selectedRun) {
    return (
      <RunDetailScreen
        run={props.selectedRun}
        agentRuns={props.agentRuns}
        artifacts={props.artifacts}
        transitions={props.transitions}
        approvals={props.approvals}
        activeTab={props.detailTab}
        onSelectTab={props.onSelectDetailTab}
        isActive={!!props.activeProcessId}
        termHeight={termHeight}
        logMode={props.logMode}
        logEvents={props.logEvents}
        outputLines={props.outputLines}
        showArtifactDiff={props.showArtifactDiff}
        jumpTarget={props.jumpTarget}
        scrollToAgentRunId={props.scrollToAgentRunId}
        onJumpToAgentRun={props.onJumpToAgentRun}
      />
    );
  }

  if (screen === "approvals") {
    return (
      <ApprovalQueueView
        items={props.approvalQueueItems}
        planRevisionRuns={props.planRevisionRuns}
        escalatedRuns={props.escalatedRuns}
        failedRuns={props.failedRuns}
        awaitingReviewRuns={props.awaitingReviewRuns}
        readyToMergeRuns={props.readyToMergeRuns}
        selectedIndex={props.approvalIndex}
        height={termHeight - 4}
      />
    );
  }

  if (screen === "runners" && props.config) {
    return (
      <RunnersView
        config={props.config}
        runs={props.runs}
        agentRuns={props.recentAgentRuns}
        runnerInfos={props.runnerInfos}
        height={termHeight - 4}
      />
    );
  }

  if (screen === "autopilot") {
    return (
      <AutopilotView
        config={props.config}
        runs={props.runs}
        autopilotRunning={props.autopilotRunning}
        stats={props.autopilotStats}
        height={termHeight - 4}
      />
    );
  }

  if (screen === "settings" && props.config) {
    return (
      <SettingsView config={props.config} height={termHeight - 4} />
    );
  }

  // Default: Dashboard
  return (
    <DashboardScreen
      runs={props.runs}
      filteredRuns={props.filteredRuns}
      selectedRunId={props.selectedRunId}
      activeProcessId={props.activeProcessId}
      focusedColumnIndex={props.focusedColumnIndex}
      autopilotRunning={props.autopilotRunning}
      autopilotStats={props.autopilotStats}
      registry={props.registry}
      config={props.config}
      filterActive={props.filterActive}
      filterQuery={props.filterQuery}
      onFilterChange={props.onFilterChange}
      store={props.store}
      layoutMode={layout.mode}
      previewWidth={layout.previewWidth}
    />
  );
}
