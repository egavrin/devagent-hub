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
  eligibleQueue: AutopilotQueueItem[];    // will be processed
  skippedQueue: AutopilotQueueItem[];     // skipped with reason
  escalatedQueue: AutopilotQueueItem[];   // needs human decision
  activeRuns: number;
  maxConcurrent: number;
  lastPollAt: string | null;
}
