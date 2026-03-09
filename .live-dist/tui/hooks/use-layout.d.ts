export type LayoutMode = "narrow" | "normal" | "wide";
export interface LayoutInfo {
    mode: LayoutMode;
    width: number;
    height: number;
    /** Max width for a single card in list/board view */
    cardWidth: number;
    /** Whether to show the preview pane alongside the board */
    showPreview: boolean;
    /** Width allocated to the preview pane (0 if not shown) */
    previewWidth: number;
    /** Width allocated to the board */
    boardWidth: number;
}
export declare function useLayout(): LayoutInfo;
