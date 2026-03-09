import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { buildLaunchArgs } from "./args-builder.js";
export class StreamingLauncher {
    config;
    constructor(config) {
        this.config = config;
    }
    launch(params) {
        const { phase, repoPath, runId, input } = params;
        const { devagentBin, artifactsDir, timeout } = this.config;
        const runDir = join(artifactsDir, runId);
        mkdirSync(runDir, { recursive: true });
        const inputPath = join(runDir, `${phase}-input.json`);
        writeFileSync(inputPath, JSON.stringify(input, null, 2));
        const outputPath = join(runDir, `${phase}-output.json`);
        const eventsPath = join(runDir, `${phase}-events.jsonl`);
        // Use shared arg builder (validates phase, approval mode, reasoning)
        const launchOptions = {
            provider: this.config.provider,
            model: this.config.model,
            maxIterations: this.config.maxIterations,
            approvalMode: this.config.approvalMode,
            reasoning: this.config.reasoning,
        };
        const args = buildLaunchArgs({ phase, repoPath, inputPath, outputPath, eventsPath }, launchOptions);
        // Support compound bin like "bun /path/to/index.js"
        const binParts = devagentBin.split(/\s+/);
        const bin = binParts[0];
        const binArgs = [...binParts.slice(1), ...args];
        const managedProcess = this.config.registry.spawn({
            id: `${runId}-${phase}`,
            phase,
            bin,
            args: binArgs,
            cwd: repoPath,
            timeout,
        });
        return { managedProcess, outputPath, eventsPath };
    }
}
