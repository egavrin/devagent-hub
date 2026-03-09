import type { WorkflowStatus } from "../state/types.js";
import type { Screen } from "./state.js";
/**
 * A registered action in the TUI.
 * Unifies keybindings, command palette, footer hints, and suggested actions.
 */
export interface Action {
    /** Unique identifier, used in command palette and dispatch */
    id: string;
    /** Human-readable label */
    label: string;
    /** Hotkey(s) shown in footer */
    hotkey: string;
    /** Keywords for command palette fuzzy search */
    keywords: string[];
    /** Which screens this action is relevant on */
    screens: Screen[];
    /**
     * Whether this action is currently available.
     * Called with current context to determine visibility.
     */
    available: (ctx: ActionContext) => boolean;
    /**
     * Whether this is the suggested "next step" action for the current run.
     * Only one action should return true at a time.
     */
    suggested?: (ctx: ActionContext) => boolean;
    /** Execute the action */
    execute: () => void;
}
export interface ActionContext {
    screen: Screen;
    runStatus: WorkflowStatus | null;
    hasActiveProcess: boolean;
    hasSelectedRun: boolean;
    hasConfig: boolean;
    autopilotRunning: boolean;
    hasPrUrl: boolean;
}
/**
 * Build the full action registry.
 * Accepts execute callbacks that are wired by the App component.
 */
export declare function buildActions(handlers: Record<string, () => void>): Action[];
/**
 * Get the suggested action for the current context.
 */
export declare function getSuggestedAction(actions: Action[], ctx: ActionContext): Action | null;
/**
 * Get actions available for the current context, suitable for footer hints.
 */
export declare function getAvailableActions(actions: Action[], ctx: ActionContext): Action[];
/**
 * Get actions for the command palette (all actions, filtered by screen).
 */
export declare function getPaletteActions(actions: Action[], ctx: ActionContext): Action[];
