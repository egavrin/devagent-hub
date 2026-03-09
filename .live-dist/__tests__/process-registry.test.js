import { describe, it, expect, afterEach } from "vitest";
import { ProcessRegistry } from "../runner/process-registry.js";
describe("ProcessRegistry", () => {
    let registry;
    afterEach(() => {
        for (const mp of registry.list()) {
            mp.kill();
        }
    });
    it("spawns and tracks a process", async () => {
        registry = new ProcessRegistry();
        const mp = registry.spawn({
            id: "agent-1",
            phase: "triage",
            bin: "echo",
            args: ["test"],
            cwd: "/tmp",
        });
        expect(registry.get("agent-1")).toBe(mp);
        expect(registry.list()).toHaveLength(1);
        await mp.onExit;
    });
    it("emits spawn event", async () => {
        registry = new ProcessRegistry();
        const spawned = [];
        registry.on("spawn", (id) => spawned.push(id));
        const mp = registry.spawn({
            id: "agent-2",
            phase: "plan",
            bin: "true",
            args: [],
            cwd: "/tmp",
        });
        expect(spawned).toEqual(["agent-2"]);
        await mp.onExit;
    });
    it("emits exit event and removes process", async () => {
        registry = new ProcessRegistry();
        const exited = [];
        registry.on("exit", (id) => exited.push(id));
        const mp = registry.spawn({
            id: "agent-3",
            phase: "implement",
            bin: "true",
            args: [],
            cwd: "/tmp",
        });
        await mp.onExit;
        await new Promise((r) => setTimeout(r, 50));
        expect(exited).toEqual(["agent-3"]);
        expect(registry.get("agent-3")).toBeNull();
    });
    it("forwards stdout as output event", async () => {
        registry = new ProcessRegistry();
        const outputs = [];
        registry.on("output", (id, data) => outputs.push({ id, data }));
        const mp = registry.spawn({
            id: "agent-4",
            phase: "triage",
            bin: "echo",
            args: ["hello"],
            cwd: "/tmp",
        });
        await mp.onExit;
        await new Promise((r) => setTimeout(r, 50));
        expect(outputs.length).toBeGreaterThan(0);
        expect(outputs[0].id).toBe("agent-4");
        expect(outputs[0].data.trim()).toBe("hello");
    });
});
