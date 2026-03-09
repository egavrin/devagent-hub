import { EventEmitter } from "events";
import { ManagedProcess, type ManagedProcessOptions } from "./managed-process.js";
export declare class ProcessRegistry extends EventEmitter {
    private processes;
    spawn(opts: ManagedProcessOptions): ManagedProcess;
    get(id: string): ManagedProcess | null;
    list(): ManagedProcess[];
}
