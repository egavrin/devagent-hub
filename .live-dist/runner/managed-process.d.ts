import { type ChildProcess } from "child_process";
import { EventEmitter } from "events";
export interface ManagedProcessOptions {
    id: string;
    phase: string;
    bin: string;
    args: string[];
    cwd: string;
    timeout?: number;
}
export declare class ManagedProcess extends EventEmitter {
    readonly id: string;
    readonly phase: string;
    readonly process: ChildProcess;
    readonly onExit: Promise<{
        exitCode: number;
    }>;
    constructor(opts: ManagedProcessOptions);
    sendInput(text: string): void;
    closeStdin(): void;
    kill(): void;
}
