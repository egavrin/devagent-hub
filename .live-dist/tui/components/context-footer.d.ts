import type { Dialog } from "../state.js";
import type { Action } from "../action-registry.js";
interface ContextFooterProps {
    dialog: Dialog;
    inputMode: boolean;
    actions: Action[];
    suggested: Action | null;
}
export declare function ContextFooter({ dialog, inputMode, actions, suggested }: ContextFooterProps): import("react/jsx-runtime").JSX.Element | null;
export {};
