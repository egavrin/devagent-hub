import { useState, useEffect } from "react";
export function useWorkflowRuns(store, pollIntervalMs = 2000) {
    const [runs, setRuns] = useState([]);
    useEffect(() => {
        const load = () => {
            setRuns(store.listAll());
        };
        load();
        const interval = setInterval(load, pollIntervalMs);
        return () => clearInterval(interval);
    }, [store, pollIntervalMs]);
    return runs;
}
