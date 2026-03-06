import { useState, useEffect } from "react";
import type { ProcessRegistry } from "../../runner/process-registry.js";

export interface OutputLine {
  timestamp: string;
  text: string;
}

export function useProcessOutput(
  registry: ProcessRegistry,
  agentRunId: string | null,
  maxLines = 500,
): OutputLine[] {
  const [lines, setLines] = useState<OutputLine[]>([]);

  useEffect(() => {
    if (!agentRunId) {
      setLines([]);
      return;
    }

    const handler = (id: string, data: string) => {
      if (id !== agentRunId) return;
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
