import { useState, useEffect } from "react";
export function useProcessOutput(registry, agentRunId, maxLines = 500) {
    const [lines, setLines] = useState([]);
    useEffect(() => {
        if (!agentRunId) {
            setLines([]);
            return;
        }
        const handler = (id, data) => {
            if (id !== agentRunId)
                return;
            const newLines = data.split("\n").filter((l) => l.length > 0).map((text) => ({
                timestamp: new Date().toISOString(),
                text,
            }));
            setLines((prev) => [...prev, ...newLines].slice(-maxLines));
        };
        registry.on("output", handler);
        return () => {
            registry.off("output", handler);
        };
    }, [registry, agentRunId, maxLines]);
    return lines;
}
