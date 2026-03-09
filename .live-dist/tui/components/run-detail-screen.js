import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { Box } from "ink";
import { DetailTabBar } from "./detail-tab-bar.js";
import { SummaryTab } from "./summary-tab.js";
import { TimelinePane } from "./timeline-pane.js";
import { ArtifactPane } from "./artifact-pane.js";
import { LogPane } from "./log-pane.js";
export function RunDetailScreen({ run, agentRuns, artifacts, transitions, approvals, activeTab, onSelectTab, isActive, termHeight, logMode, logEvents, outputLines, showArtifactDiff, jumpTarget, scrollToAgentRunId, onJumpToAgentRun, }) {
    const contentHeight = termHeight - 6;
    return (_jsxs(_Fragment, { children: [_jsx(DetailTabBar, { activeTab: activeTab, onSelect: onSelectTab }), _jsx(Box, { flexGrow: 1, flexDirection: "column", overflow: "hidden", children: activeTab === "summary" ? (_jsx(SummaryTab, { run: run, artifacts: artifacts, transitions: transitions, agentRuns: agentRuns, approvals: approvals, isActive: isActive, height: contentHeight })) : activeTab === "timeline" ? (_jsx(TimelinePane, { agentRuns: agentRuns, transitions: transitions, artifacts: artifacts, isFocused: true, height: contentHeight, jumpTarget: jumpTarget, scrollToAgentRunId: scrollToAgentRunId })) : activeTab === "artifacts" ? (_jsx(ArtifactPane, { artifacts: artifacts, approvals: approvals, agentRuns: agentRuns, isFocused: true, height: contentHeight, showDiff: showArtifactDiff, onJumpToAgentRun: onJumpToAgentRun })) : (_jsx(LogPane, { selectedRun: run, logMode: logMode, events: logEvents, outputLines: outputLines, isFocused: true })) })] }));
}
