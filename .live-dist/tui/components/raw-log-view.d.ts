import type { OutputLine } from "../hooks/use-process-output.js";
interface RawLogViewProps {
    lines: OutputLine[];
    maxVisible?: number;
}
export declare function RawLogView({ lines, maxVisible }: RawLogViewProps): import("react/jsx-runtime").JSX.Element;
export {};
