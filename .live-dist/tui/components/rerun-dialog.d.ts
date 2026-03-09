interface RerunDialogProps {
    profiles: string[];
    selectedIndex: number;
    onSelect: (profile: string) => void;
    onCancel: () => void;
}
export declare function RerunDialog({ profiles, selectedIndex, onSelect, onCancel }: RerunDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
