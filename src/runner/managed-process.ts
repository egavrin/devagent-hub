import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";

export interface ManagedProcessOptions {
  id: string;
  phase: string;
  bin: string;
  args: string[];
  cwd: string;
  timeout?: number;
}

export class ManagedProcess extends EventEmitter {
  readonly id: string;
  readonly phase: string;
  readonly process: ChildProcess;
  readonly onExit: Promise<{ exitCode: number }>;

  constructor(opts: ManagedProcessOptions) {
    super();
    this.id = opts.id;
    this.phase = opts.phase;

    this.process = spawn(opts.bin, opts.args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.setEncoding("utf-8");
    this.process.stderr?.setEncoding("utf-8");

    this.process.stdout?.on("data", (data: string) => {
      this.emit("stdout", data);
    });

    this.process.stderr?.on("data", (data: string) => {
      this.emit("stderr", data);
    });

    let timer: ReturnType<typeof setTimeout> | undefined;

    this.onExit = new Promise((resolve) => {
      this.process.on("close", (code) => {
        if (timer) clearTimeout(timer);
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

  sendInput(text: string): void {
    this.process.stdin?.write(text);
  }

  closeStdin(): void {
    this.process.stdin?.end();
  }

  kill(): void {
    this.process.kill("SIGTERM");
  }
}
