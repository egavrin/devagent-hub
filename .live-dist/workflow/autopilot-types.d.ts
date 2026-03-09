import type { AutopilotDecision } from "./autopilot-engine.js";
export interface AutopilotQueueItem {
    issueNumber: number;
    title: string;
    labels: string[];
    decision: AutopilotDecision;
    enqueuedAt: string;
}
export interface AutopilotStatus {
    enabled: boolean;
    eligibleQueue: AutopilotQueueItem[];
    skippedQueue: AutopilotQueueItem[];
    escalatedQueue: AutopilotQueueItem[];
    activeRuns: number;
    maxConcurrent: number;
    lastPollAt: string | null;
}
