import { EventEmitter } from "events";
import { ManagedProcess, type ManagedProcessOptions } from "./managed-process.js";

export class ProcessRegistry extends EventEmitter {
  private processes = new Map<string, ManagedProcess>();

  spawn(opts: ManagedProcessOptions): ManagedProcess {
    const mp = new ManagedProcess(opts);
    this.processes.set(mp.id, mp);

    mp.on("stdout", (data: string) => {
      this.emit("output", mp.id, data);
    });

    mp.on("stderr", (data: string) => {
      this.emit("output", mp.id, data);
    });

    mp.on("exit", (exitCode: number) => {
      this.processes.delete(mp.id);
      this.emit("exit", mp.id, exitCode);
    });

    this.emit("spawn", mp.id);
    return mp;
  }

  get(id: string): ManagedProcess | null {
    return this.processes.get(id) ?? null;
  }

  list(): ManagedProcess[] {
    return Array.from(this.processes.values());
  }
}
