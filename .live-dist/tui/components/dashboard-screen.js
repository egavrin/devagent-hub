import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { KanbanBoard } from "./kanban-board.js";
import { RunListView } from "./run-list-view.js";
import { SummaryBar } from "./summary-bar.js";
import { AutopilotBar } from "./autopilot-bar.js";
import { RunCardPreview } from "./run-card-preview.js";
import { toBoardSummaryViewModel } from "../view-models.js";
export function DashboardScreen({ runs, filteredRuns, selectedRunId, activeProcessId, focusedColumnIndex, autopilotRunning, autopilotStats, registry, config, filterActive, filterQuery, onFilterChange, store, layoutMode, previewWidth, }) {
    const summary = toBoardSummaryViewModel(runs);
    const selectedRun = selectedRunId ? filteredRuns.find((r) => r.id === selectedRunId) ?? null : null;
    return (_jsxs(_Fragment, { children: [_jsx(SummaryBar, { mode: summary.mode, runningCount: summary.runningCount, needsActionCount: summary.needsActionCount, blockedCount: summary.blockedCount, failedCount: summary.failedCount, doneCount: summary.doneCount, totalCount: summary.totalCount, autopilotOn: autopilotRunning, activeRunners: registry.list().length }), _jsx(AutopilotBar, { running: autopilotRunning, lastPoll: autopilotStats.lastPoll, activeCount: autopilotStats.activeCount, totalDispatched: autopilotStats.totalDispatched, escalatedCount: runs.filter(r => r.status === "escalated").length, maxEscalations: config?.budget.max_unresolved_escalations, totalCostUsd: store.getRecentAgentRuns(1000).reduce((sum, ar) => sum + (ar.costUsd ?? 0), 0), sessionMaxCostUsd: config?.budget.session_max_cost_usd }), filterActive && (_jsxs(Box, { paddingLeft: 1, flexShrink: 0, children: [_jsx(Text, { color: "cyan", children: "Filter: " }), _jsx(TextInput, { value: filterQuery, onChange: onFilterChange, onSubmit: () => { } }), _jsx(Text, { dimColor: true, children: "  [/ to close, type to filter]" })] })), layoutMode === "narrow" ? (
            /* Narrow: single-column list */
            _jsx(RunListView, { runs: filteredRuns, selectedRunId: selectedRunId, activeRunId: activeProcessId })) : layoutMode === "wide" ? (
            /* Wide: board + preview pane */
            _jsxs(Box, { flexDirection: "row", width: "100%", children: [_jsx(Box, { flexGrow: 1, children: _jsx(KanbanBoard, { runs: filteredRuns, selectedRunId: selectedRunId, activeRunId: activeProcessId, focusedColumnIndex: focusedColumnIndex, isFocused: true, compactMode: true }) }), _jsx(Box, { width: previewWidth, flexShrink: 0, borderStyle: "single", borderColor: "gray", flexDirection: "column", paddingLeft: 1, children: _jsx(RunCardPreview, { run: selectedRun }) })] })) : (
            /* Normal: compact board */
            _jsx(KanbanBoard, { runs: filteredRuns, selectedRunId: selectedRunId, activeRunId: activeProcessId, focusedColumnIndex: focusedColumnIndex, isFocused: true, compactMode: true }))] }));
}
