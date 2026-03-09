import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, rmSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { EventParser } from "../tui/event-parser.js";
function makeTmpDir() {
    const dir = join(tmpdir(), `evparser-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    return dir;
}
describe("EventParser", () => {
    const dirs = [];
    const parsers = [];
    afterEach(() => {
        for (const p of parsers)
            p.stop();
        parsers.length = 0;
        for (const d of dirs)
            rmSync(d, { recursive: true, force: true });
        dirs.length = 0;
    });
    it("parses existing JSONL lines", async () => {
        const dir = makeTmpDir();
        dirs.push(dir);
        const filePath = join(dir, "events.jsonl");
        writeFileSync(filePath, [
            JSON.stringify({ timestamp: "2026-01-01T00:00:00Z", type: "tool_call", name: "read", summary: "Reading file" }),
            JSON.stringify({ timestamp: "2026-01-01T00:00:01Z", type: "tool_result", name: "read", summary: "Done" }),
        ].join("\n") + "\n");
        const events = [];
        const parser = new EventParser(filePath, (e) => events.push(e));
        parsers.push(parser);
        parser.start();
        await new Promise((r) => setTimeout(r, 100));
        expect(events).toHaveLength(2);
        expect(events[0].type).toBe("tool_call");
        expect(events[1].type).toBe("tool_result");
    });
    it("watches for new lines appended to the file", async () => {
        const dir = makeTmpDir();
        dirs.push(dir);
        const filePath = join(dir, "events.jsonl");
        writeFileSync(filePath, "");
        const events = [];
        const parser = new EventParser(filePath, (e) => events.push(e));
        parsers.push(parser);
        parser.start();
        await new Promise((r) => setTimeout(r, 100));
        appendFileSync(filePath, JSON.stringify({ timestamp: "t1", type: "output", summary: "hi" }) + "\n");
        await new Promise((r) => setTimeout(r, 300));
        expect(events).toHaveLength(1);
        expect(events[0].summary).toBe("hi");
    });
    it("handles malformed JSON lines gracefully", async () => {
        const dir = makeTmpDir();
        dirs.push(dir);
        const filePath = join(dir, "events.jsonl");
        writeFileSync(filePath, "not json\n" + JSON.stringify({ timestamp: "t", type: "error", summary: "oops" }) + "\n");
        const events = [];
        const parser = new EventParser(filePath, (e) => events.push(e));
        parsers.push(parser);
        parser.start();
        await new Promise((r) => setTimeout(r, 100));
        expect(events).toHaveLength(2);
        expect(events[0].type).toBe("unknown");
        expect(events[1].type).toBe("error");
    });
});
