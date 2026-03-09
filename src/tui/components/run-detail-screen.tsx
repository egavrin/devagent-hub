import React from "react";
import { Box } from "ink";
import type { WorkflowRun, AgentRun, Artifact, ApprovalRequest, StatusTransition } from "../../state/types.js";
import type { DetailTab, JumpTarget } from "../state.js";
import type { OutputLine } from "../hooks/use-process-output.js";
import { DetailTabBar } from "./detail-tab-bar.js";
import { SummaryTab } from "./summary-tab.js";
import { TimelinePane } from "./timeline-pane.js";
import { ArtifactPane } from "./artifact-pane.js";
import { LogPane } from "./log-pane.js";

interface RunDetailScreenProps {
  run: WorkflowRun;
  agentRuns: AgentRun[];
  artifacts: Artifact[];
  transitions: StatusTransition[];
  approvals: ApprovalRequest[];
  activeTab: DetailTab;
  onSelectTab: (tab: DetailTab) => void;
  isActive: boolean;
  termHeight: number;
  logMode: "structured" | "raw" | "errors";
  logEvents: { timestamp: string; type: "output"; summary: string }[];
  outputLines: OutputLine[];
  showArtifactDiff: boolean;
  jumpTarget: JumpTarget | null;
  scrollToAgentRunId: string | null;
  onJumpToAgentRun: (agentRunId: string) => void;
}

export function RunDetailScreen({
  run,
  agentRuns,
  artifacts,
  transitions,
  approvals,
  activeTab,
  onSelectTab,
  isActive,
  termHeight,
  logMode,
  logEvents,
  outputLines,
  showArtifactDiff,
  jumpTarget,
  scrollToAgentRunId,
  onJumpToAgentRun,
}: RunDetailScreenProps) {
  const contentHeight = termHeight - 6;

  return (
    <>
      <DetailTabBar activeTab={activeTab} onSelect={onSelectTab} />
      <Box flexGrow={1} flexDirection="column" overflow="hidden">
        {activeTab === "summary" ? (
          <SummaryTab
            run={run}
            artifacts={artifacts}
            transitions={transitions}
            agentRuns={agentRuns}
            approvals={approvals}
            isActive={isActive}
            height={contentHeight}
          />
        ) : activeTab === "timeline" ? (
          <TimelinePane
            agentRuns={agentRuns}
            transitions={transitions}
            artifacts={artifacts}
            isFocused={true}
            height={contentHeight}
            jumpTarget={jumpTarget}
            scrollToAgentRunId={scrollToAgentRunId}
          />
        ) : activeTab === "artifacts" ? (
          <ArtifactPane
            artifacts={artifacts}
            approvals={approvals}
            agentRuns={agentRuns}
            isFocused={true}
            height={contentHeight}
            showDiff={showArtifactDiff}
            onJumpToAgentRun={onJumpToAgentRun}
          />
        ) : (
          <LogPane
            selectedRun={run}
            logMode={logMode}
            events={logEvents}
            outputLines={outputLines}
            isFocused={true}
          />
        )}
      </Box>
    </>
  );
}
