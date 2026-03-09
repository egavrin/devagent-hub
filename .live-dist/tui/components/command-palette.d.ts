import type { Action } from "../action-registry.js";
export type PaletteCommand = string;
interface CommandPaletteProps {
    actions: Action[];
    onSubmit: (actionId: string) => void;
    onCancel: () => void;
}
export declare function CommandPalette({ actions, onSubmit, onCancel }: CommandPaletteProps): import("react/jsx-runtime").JSX.Element;
export {};
