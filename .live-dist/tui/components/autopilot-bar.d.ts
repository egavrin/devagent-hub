interface AutopilotBarProps {
    running: boolean;
    lastPoll: string | null;
    activeCount: number;
    totalDispatched: number;
    escalatedCount?: number;
    maxEscalations?: number;
    totalCostUsd?: number;
    sessionMaxCostUsd?: number;
}
export declare function AutopilotBar({ running, lastPoll, activeCount, totalDispatched, escalatedCount, maxEscalations, totalCostUsd, sessionMaxCostUsd }: AutopilotBarProps): import("react/jsx-runtime").JSX.Element | null;
export {};
