import { useMemo } from "react";
import { buildActions, getAvailableActions, getSuggestedAction, getPaletteActions } from "../action-registry.js";
export function useActions(opts) {
    const { screen, selectedRun, hasActiveProcess, hasConfig, autopilotRunning, handlers } = opts;
    const actions = useMemo(() => buildActions(handlers), [handlers]);
    const context = useMemo(() => ({
        screen,
        runStatus: selectedRun?.status ?? null,
        hasActiveProcess,
        hasSelectedRun: selectedRun !== null,
        hasConfig,
        autopilotRunning,
        hasPrUrl: !!selectedRun?.prUrl,
    }), [screen, selectedRun, hasActiveProcess, hasConfig, autopilotRunning]);
    const available = useMemo(() => getAvailableActions(actions, context), [actions, context]);
    const palette = useMemo(() => getPaletteActions(actions, context), [actions, context]);
    const suggested = useMemo(() => getSuggestedAction(actions, context), [actions, context]);
    const execute = useMemo(() => {
        const map = new Map(actions.map((a) => [a.id, a]));
        return (id) => {
            const action = map.get(id);
            if (action?.available(context)) {
                action.execute();
            }
        };
    }, [actions, context]);
    return { all: actions, available, palette, suggested, context, execute };
}
