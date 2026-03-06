import { readFileSync, watch, existsSync, type FSWatcher } from "fs";

export interface AgentEvent {
  timestamp: string;
  type: "tool_call" | "tool_result" | "thinking" | "output" | "error" | "unknown";
  name?: string;
  summary?: string;
  detail?: unknown;
}

export class EventParser {
  private filePath: string;
  private callback: (event: AgentEvent) => void;
  private bytesRead = 0;
  private watcher: FSWatcher | null = null;

  constructor(filePath: string, callback: (event: AgentEvent) => void) {
    this.filePath = filePath;
    this.callback = callback;
  }

  start(): void {
    if (existsSync(this.filePath)) {
      this.readNewLines();
    }
    try {
      this.watcher = watch(this.filePath, () => {
        this.readNewLines();
      });
    } catch {
      // File may not exist yet
    }
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private readNewLines(): void {
    let content: string;
    try {
      content = readFileSync(this.filePath, "utf-8");
    } catch {
      return;
    }
    const newContent = content.slice(this.bytesRead);
    this.bytesRead = content.length;
    if (!newContent) return;
    const lines = newContent.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      this.callback(this.parseLine(line));
    }
  }

  private parseLine(line: string): AgentEvent {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      return {
        timestamp: (parsed.timestamp as string) ?? new Date().toISOString(),
        type: this.normalizeType(parsed.type as string),
        name: parsed.name as string | undefined,
        summary: parsed.summary as string | undefined,
        detail: parsed.detail,
      };
    } catch {
      return {
        timestamp: new Date().toISOString(),
        type: "unknown",
        summary: line,
      };
    }
  }

  private normalizeType(type: string | undefined): AgentEvent["type"] {
    const valid = ["tool_call", "tool_result", "thinking", "output", "error"];
    return valid.includes(type ?? "") ? (type as AgentEvent["type"]) : "unknown";
  }
}
