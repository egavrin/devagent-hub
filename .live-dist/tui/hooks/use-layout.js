import { useMemo } from "react";
import { useStdout } from "ink";
const NARROW_THRESHOLD = 80;
const WIDE_THRESHOLD = 140;
export function useLayout() {
    const { stdout } = useStdout();
    const width = stdout?.columns ?? 120;
    const height = stdout?.rows ?? 40;
    return useMemo(() => {
        if (width < NARROW_THRESHOLD) {
            return {
                mode: "narrow",
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
                mode: "wide",
                width,
                height,
                cardWidth: 30,
                showPreview: true,
                previewWidth,
                boardWidth: width - previewWidth,
            };
        }
        return {
            mode: "normal",
            width,
            height,
            cardWidth: Math.floor((width - 6) / 3),
            showPreview: false,
            previewWidth: 0,
            boardWidth: width,
        };
    }, [width, height]);
}
