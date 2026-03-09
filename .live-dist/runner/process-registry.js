import { EventEmitter } from "events";
import { ManagedProcess } from "./managed-process.js";
export class ProcessRegistry extends EventEmitter {
    processes = new Map();
    spawn(opts) {
        const mp = new ManagedProcess(opts);
        this.processes.set(mp.id, mp);
        mp.on("stdout", (data) => {
            this.emit("output", mp.id, data);
        });
        mp.on("stderr", (data) => {
            this.emit("output", mp.id, data);
        });
        mp.on("exit", (exitCode) => {
            this.processes.delete(mp.id);
            this.emit("exit", mp.id, exitCode);
        });
        this.emit("spawn", mp.id);
        return mp;
    }
    get(id) {
        return this.processes.get(id) ?? null;
    }
    list() {
        return Array.from(this.processes.values());
    }
}
