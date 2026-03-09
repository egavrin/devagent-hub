export type BookmarkType = "phase_start" | "tool_error" | "gate_verdict" | "pr_open" | "ci_fail";
export interface LogEntry {
    timestamp: string;
    text: string;
    bookmark?: BookmarkType;
}
export declare function useEventLog(eventsPath: string | null, maxLines?: number): LogEntry[];
