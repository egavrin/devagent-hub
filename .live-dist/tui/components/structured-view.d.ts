import type { AgentEvent } from "../event-parser.js";
interface StructuredViewProps {
    events: AgentEvent[];
    maxVisible?: number;
}
export declare function StructuredView({ events, maxVisible }: StructuredViewProps): import("react/jsx-runtime").JSX.Element;
export {};
