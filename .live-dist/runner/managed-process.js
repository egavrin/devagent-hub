import { spawn } from "child_process";
import { EventEmitter } from "events";
export class ManagedProcess extends EventEmitter {
    id;
    phase;
    process;
    onExit;
    constructor(opts) {
        super();
        this.id = opts.id;
        this.phase = opts.phase;
        this.process = spawn(opts.bin, opts.args, {
            cwd: opts.cwd,
            stdio: ["pipe", "pipe", "pipe"],
        });
        this.process.stdout?.setEncoding("utf-8");
        this.process.stderr?.setEncoding("utf-8");
        this.process.stdout?.on("data", (data) => {
            this.emit("stdout", data);
        });
        this.process.stderr?.on("data", (data) => {
            this.emit("stderr", data);
        });
        let timer;
        this.onExit = new Promise((resolve) => {
            this.process.on("close", (code) => {
                if (timer)
                    clearTimeout(timer);
                const exitCode = code ?? 1;
                this.emit("exit", exitCode);
                resolve({ exitCode });
            });
        });
        if (opts.timeout) {
            timer = setTimeout(() => {
                this.process.kill("SIGTERM");
            }, opts.timeout);
        }
    }
    sendInput(text) {
        this.process.stdin?.write(text);
    }
    closeStdin() {
        this.process.stdin?.end();
    }
    kill() {
        this.process.kill("SIGTERM");
    }
}
