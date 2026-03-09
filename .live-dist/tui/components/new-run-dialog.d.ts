import type { NewRunForm, NewRunSourceType, NewRunMode, GateStrictness, RunPriority } from "../state.js";
interface NewRunDialogProps {
    form: NewRunForm;
    profiles: string[];
    runners: string[];
    onChangeSourceType: (t: NewRunSourceType) => void;
    onChangeSourceId: (v: string) => void;
    onChangeMode: (m: NewRunMode) => void;
    onChangeProfile: (p: string) => void;
    onChangeRunner: (r: string) => void;
    onChangeModel: (m: string) => void;
    onChangeGateStrictness: (g: GateStrictness) => void;
    onChangePriority: (p: RunPriority) => void;
    onSubmit: () => void;
    onCancel: () => void;
}
export declare function NewRunDialog({ form, profiles, runners, onChangeSourceType, onChangeSourceId, onChangeMode, onChangeProfile, onChangeRunner, onChangeModel, onChangeGateStrictness, onChangePriority, onSubmit, onCancel, }: NewRunDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
