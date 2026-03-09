import { resolve } from "node:path";
import { LocalRunner } from "@devagent-runner/local-runner";
import { ClaudeAdapter, CodexAdapter, DevAgentAdapter, OpenCodeAdapter, } from "@devagent-runner/adapters";
export class LocalRunnerClient {
    runner;
    constructor(devagentCliPath = resolve(process.cwd(), "..", "devagent", "packages", "cli", "dist", "index.js")) {
        this.runner = new LocalRunner({
            adapters: [
                new DevAgentAdapter(`bun ${devagentCliPath}`),
                new CodexAdapter(),
                new ClaudeAdapter(),
                new OpenCodeAdapter(),
            ],
        });
    }
    startTask(request) {
        return this.runner.startTask(request);
    }
    subscribe(runId, onEvent) {
        return this.runner.subscribe(runId, onEvent);
    }
    cancel(runId) {
        return this.runner.cancel(runId);
    }
    awaitResult(runId) {
        return this.runner.awaitResult(runId);
    }
    inspect(runId) {
        return this.runner.inspect(runId);
    }
    cleanupRun(runId) {
        return this.runner.cleanupRun(runId);
    }
}
