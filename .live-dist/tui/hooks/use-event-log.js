import { useState, useEffect, useRef } from "react";
import { existsSync, openSync, readSync, closeSync, watchFile, unwatchFile, statSync } from "fs";
export function useEventLog(eventsPath, maxLines = 200) {
    const [lines, setLines] = useState([]);
    const bytesRead = useRef(0);
    const pendingText = useRef("");
    useEffect(() => {
        if (!eventsPath) {
            setLines([]);
            bytesRead.current = 0;
            pendingText.current = "";
            return;
        }
        const readNew = () => {
            if (!existsSync(eventsPath))
                return;
            try {
                const stat = statSync(eventsPath);
                if (stat.size <= bytesRead.current)
                    return;
                const buf = Buffer.alloc(stat.size - bytesRead.current);
                const fd = openSync(eventsPath, "r");
                readSync(fd, buf, 0, buf.length, bytesRead.current);
                closeSync(fd);
                bytesRead.current = stat.size;
                const chunk = buf.toString("utf-8");
                const newEntries = [];
                for (const line of chunk.split("\n")) {
                    if (!line.trim())
                        continue;
                    let ev;
                    try {
                        ev = JSON.parse(line);
                    }
                    catch {
                        continue;
                    }
                    const type = ev.type;
                    const ts = ev.ts ?? new Date().toISOString();
                    // Accumulate streaming assistant tokens
                    if (type === "message:assistant") {
                        const content = ev.content;
                        if (ev.partial === true) {
                            pendingText.current += content ?? "";
                            continue;
                        }
                        // partial=false: flush accumulated text
                        const full = pendingText.current + (content ?? "");
                        pendingText.current = "";
                        if (full.trim()) {
                            newEntries.push({ timestamp: ts, text: full.trim() });
                        }
                        continue;
                    }
                    // Non-assistant event: flush any pending text first
                    if (pendingText.current.trim()) {
                        newEntries.push({ timestamp: ts, text: pendingText.current.trim() });
                        pendingText.current = "";
                    }
                    switch (type) {
                        case "iteration:start":
                            newEntries.push({
                                timestamp: ts,
                                text: `── iteration ${ev.iteration} ──`,
                                bookmark: ev.iteration === 1 ? "phase_start" : undefined,
                            });
                            break;
                        case "tool:before":
                            newEntries.push({ timestamp: ts, text: `▶ ${ev.name}` });
                            break;
                        case "tool:after":
                            newEntries.push({ timestamp: ts, text: `✓ ${ev.name}` });
                            break;
                        case "tool:error":
                            newEntries.push({ timestamp: ts, text: `✗ ${ev.name}: ${ev.error ?? "error"}`, bookmark: "tool_error" });
                            break;
                        case "gate:verdict":
                            newEntries.push({ timestamp: ts, text: `[gate:verdict] ${ev.action ?? ""}`, bookmark: "gate_verdict" });
                            break;
                        case "pr:opened":
                            newEntries.push({ timestamp: ts, text: `[pr:opened] ${ev.url ?? ""}`, bookmark: "pr_open" });
                            break;
                        case "ci:fail":
                        case "verify:fail":
                            newEntries.push({ timestamp: ts, text: `[${type}] ${ev.message ?? ev.error ?? ""}`, bookmark: "ci_fail" });
                            break;
                        case "iteration:end":
                            break;
                        default:
                            newEntries.push({ timestamp: ts, text: `[${type}]` });
                            break;
                    }
                }
                if (newEntries.length > 0) {
                    setLines((prev) => [...prev, ...newEntries].slice(-maxLines));
                }
            }
            catch {
                // file may not exist yet
            }
        };
        readNew();
        watchFile(eventsPath, { interval: 300 }, readNew);
        return () => {
            unwatchFile(eventsPath, readNew);
            bytesRead.current = 0;
            pendingText.current = "";
        };
    }, [eventsPath, maxLines]);
    return lines;
}
