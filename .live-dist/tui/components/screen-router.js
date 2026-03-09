import { jsx as _jsx } from "react/jsx-runtime";
import { useLayout } from "../hooks/use-layout.js";
import { DashboardScreen } from "./dashboard-screen.js";
import { RunDetailScreen } from "./run-detail-screen.js";
import { ApprovalQueueView } from "./approval-queue-view.js";
import { RunnersView } from "./runners-view.js";
import { AutopilotView } from "./autopilot-view.js";
import { SettingsView } from "./settings-view.js";
export function ScreenRouter(props) {
    const { screen, termHeight } = props;
    const layout = useLayout();
    if (screen === "run" && props.selectedRun) {
        return (_jsx(RunDetailScreen, { run: props.selectedRun, agentRuns: props.agentRuns, artifacts: props.artifacts, transitions: props.transitions, approvals: props.approvals, activeTab: props.detailTab, onSelectTab: props.onSelectDetailTab, isActive: !!props.activeProcessId, termHeight: termHeight, logMode: props.logMode, logEvents: props.logEvents, outputLines: props.outputLines, showArtifactDiff: props.showArtifactDiff, jumpTarget: props.jumpTarget, scrollToAgentRunId: props.scrollToAgentRunId, onJumpToAgentRun: props.onJumpToAgentRun }));
    }
    if (screen === "approvals") {
        return (_jsx(ApprovalQueueView, { items: props.approvalQueueItems, planRevisionRuns: props.planRevisionRuns, escalatedRuns: props.escalatedRuns, failedRuns: props.failedRuns, awaitingReviewRuns: props.awaitingReviewRuns, readyToMergeRuns: props.readyToMergeRuns, selectedIndex: props.approvalIndex, height: termHeight - 4 }));
    }
    if (screen === "runners" && props.config) {
        return (_jsx(RunnersView, { config: props.config, runs: props.runs, agentRuns: props.recentAgentRuns, runnerInfos: props.runnerInfos, height: termHeight - 4 }));
    }
    if (screen === "autopilot") {
        return (_jsx(AutopilotView, { config: props.config, runs: props.runs, autopilotRunning: props.autopilotRunning, stats: props.autopilotStats, height: termHeight - 4 }));
    }
    if (screen === "settings" && props.config) {
        return (_jsx(SettingsView, { config: props.config, height: termHeight - 4 }));
    }
    // Default: Dashboard
    return (_jsx(DashboardScreen, { runs: props.runs, filteredRuns: props.filteredRuns, selectedRunId: props.selectedRunId, activeProcessId: props.activeProcessId, focusedColumnIndex: props.focusedColumnIndex, autopilotRunning: props.autopilotRunning, autopilotStats: props.autopilotStats, registry: props.registry, config: props.config, filterActive: props.filterActive, filterQuery: props.filterQuery, onFilterChange: props.onFilterChange, store: props.store, layoutMode: layout.mode, previewWidth: layout.previewWidth }));
}
