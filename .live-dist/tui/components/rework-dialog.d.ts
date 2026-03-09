interface ReworkDialogProps {
    issueNumber: number;
    note: string;
    onChangeNote: (v: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
}
export declare function ReworkDialog({ issueNumber, note, onChangeNote, onSubmit, onCancel }: ReworkDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
