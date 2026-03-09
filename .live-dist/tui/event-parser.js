import { readFileSync, watch, existsSync } from "fs";
export class EventParser {
    filePath;
    callback;
    bytesRead = 0;
    watcher = null;
    constructor(filePath, callback) {
        this.filePath = filePath;
        this.callback = callback;
    }
    start() {
        if (existsSync(this.filePath)) {
            this.readNewLines();
        }
        try {
            this.watcher = watch(this.filePath, () => {
                this.readNewLines();
            });
        }
        catch {
            // File may not exist yet
        }
    }
    stop() {
        this.watcher?.close();
        this.watcher = null;
    }
    readNewLines() {
        let content;
        try {
            content = readFileSync(this.filePath, "utf-8");
        }
        catch {
            return;
        }
        const newContent = content.slice(this.bytesRead);
        this.bytesRead = content.length;
        if (!newContent)
            return;
        const lines = newContent.split("\n").filter((l) => l.trim());
        for (const line of lines) {
            this.callback(this.parseLine(line));
        }
    }
    parseLine(line) {
        try {
            const parsed = JSON.parse(line);
            return {
                timestamp: parsed.timestamp ?? new Date().toISOString(),
                type: this.normalizeType(parsed.type),
                name: parsed.name,
                summary: parsed.summary,
                detail: parsed.detail,
            };
        }
        catch {
            return {
                timestamp: new Date().toISOString(),
                type: "unknown",
                summary: line,
            };
        }
    }
    normalizeType(type) {
        const valid = ["tool_call", "tool_result", "thinking", "output", "error"];
        return valid.includes(type ?? "") ? type : "unknown";
    }
}
