import type { ProcessRegistry } from "../../runner/process-registry.js";
export interface OutputLine {
    timestamp: string;
    text: string;
}
export declare function useProcessOutput(registry: ProcessRegistry, agentRunId: string | null, maxLines?: number): OutputLine[];
