export interface AgentEvent {
    timestamp: string;
    type: "tool_call" | "tool_result" | "thinking" | "output" | "error" | "unknown";
    name?: string;
    summary?: string;
    detail?: unknown;
}
export declare class EventParser {
    private filePath;
    private callback;
    private bytesRead;
    private watcher;
    constructor(filePath: string, callback: (event: AgentEvent) => void);
    start(): void;
    stop(): void;
    private readNewLines;
    private parseLine;
    private normalizeType;
}
