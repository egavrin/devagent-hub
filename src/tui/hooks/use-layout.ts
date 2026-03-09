import { useMemo } from "react";
import { useStdout } from "ink";

export type LayoutMode = "narrow" | "normal" | "wide";

const NARROW_THRESHOLD = 80;
const WIDE_THRESHOLD = 140;

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

export function useLayout(): LayoutInfo {
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 120;
  const height = stdout?.rows ?? 40;

  return useMemo(() => {
    if (width < NARROW_THRESHOLD) {
      return {
        mode: "narrow" as const,
        width,
        height,
        cardWidth: width - 4,
        showPreview: false,
        previewWidth: 0,
        boardWidth: width,
      };
    }

    if (width >= WIDE_THRESHOLD) {
      const previewWidth = Math.min(60, Math.floor(width * 0.35));
      return {
        mode: "wide" as const,
        width,
        height,
        cardWidth: 30,
        showPreview: true,
        previewWidth,
        boardWidth: width - previewWidth,
      };
    }

    return {
      mode: "normal" as const,
      width,
      height,
      cardWidth: Math.floor((width - 6) / 3),
      showPreview: false,
      previewWidth: 0,
      boardWidth: width,
    };
  }, [width, height]);
}
