import { useMemo } from "react";
import type { WorkflowRun, WorkflowStatus } from "../../state/types.js";
import type { Screen } from "../state.js";
import { buildActions, getAvailableActions, getSuggestedAction, getPaletteActions } from "../action-registry.js";
import type { Action, ActionContext } from "../action-registry.js";

interface UseActionsOptions {
  screen: Screen;
  selectedRun: WorkflowRun | null;
  hasActiveProcess: boolean;
  hasConfig: boolean;
  autopilotRunning: boolean;
  handlers: Record<string, () => void>;
}

export interface ActionsResult {
  /** All registered actions */
  all: Action[];
  /** Actions available on the current screen + context */
  available: Action[];
  /** Actions for the command palette */
  palette: Action[];
  /** The single suggested next action, if any */
  suggested: Action | null;
  /** Current context */
  context: ActionContext;
  /** Execute an action by id */
  execute: (id: string) => void;
}

export function useActions(opts: UseActionsOptions): ActionsResult {
  const { screen, selectedRun, hasActiveProcess, hasConfig, autopilotRunning, handlers } = opts;

  const actions = useMemo(() => buildActions(handlers), [handlers]);

  const context: ActionContext = useMemo(() => ({
    screen,
    runStatus: (selectedRun?.status as WorkflowStatus) ?? null,
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
    return (id: string) => {
      const action = map.get(id);
      if (action?.available(context)) {
        action.execute();
      }
    };
  }, [actions, context]);

  return { all: actions, available, palette, suggested, context, execute };
}
