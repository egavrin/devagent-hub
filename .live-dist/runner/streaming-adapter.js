import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
export class StreamingLauncherAdapter {
    launcher;
    constructor(launcher) {
        this.launcher = launcher;
    }
    async launch(params) {
        const { managedProcess, outputPath, eventsPath } = this.launcher.launch(params);
        // Capture stderr for debugging failed runs
        const stderrChunks = [];
        managedProcess.on("stderr", (data) => {
            stderrChunks.push(data);
        });
        const { exitCode } = await managedProcess.onExit;
        if (exitCode !== 0 && stderrChunks.length > 0) {
            const stderrPath = join(dirname(outputPath), `${params.phase}-stderr.txt`);
            writeFileSync(stderrPath, stderrChunks.join(""));
        }
        let output = null;
        if (existsSync(outputPath)) {
            try {
                output = JSON.parse(readFileSync(outputPath, "utf-8"));
            }
            catch {
                output = null;
            }
        }
        return { exitCode, outputPath, eventsPath, output };
    }
}
