import { describe, it, expect } from "vitest";
import { ManagedProcess } from "../runner/managed-process.js";

describe("ManagedProcess", () => {
  it("captures stdout from a subprocess", async () => {
    const mp = new ManagedProcess({
      id: "test-1",
      phase: "triage",
      bin: "echo",
      args: ["hello world"],
      cwd: "/tmp",
    });

    const chunks: string[] = [];
    mp.on("stdout", (data: string) => chunks.push(data));

    const { exitCode } = await mp.onExit;
    expect(exitCode).toBe(0);
    expect(chunks.join("").trim()).toBe("hello world");
  });

  it("captures stderr from a subprocess", async () => {
    const mp = new ManagedProcess({
      id: "test-2",
      phase: "triage",
      bin: "sh",
      args: ["-c", "echo err >&2"],
      cwd: "/tmp",
    });

    const chunks: string[] = [];
    mp.on("stderr", (data: string) => chunks.push(data));

    const { exitCode } = await mp.onExit;
    expect(exitCode).toBe(0);
    expect(chunks.join("").trim()).toBe("err");
  });

  it("reports non-zero exit code", async () => {
    const mp = new ManagedProcess({
      id: "test-3",
      phase: "implement",
      bin: "false",
      args: [],
      cwd: "/tmp",
    });

    const { exitCode } = await mp.onExit;
    expect(exitCode).not.toBe(0);
  });

  it("sends input via stdin", async () => {
    const mp = new ManagedProcess({
      id: "test-4",
      phase: "triage",
      bin: "cat",
      args: [],
      cwd: "/tmp",
    });

    const chunks: string[] = [];
    mp.on("stdout", (data: string) => chunks.push(data));

    mp.sendInput("hello from stdin\n");
    mp.closeStdin();

    const { exitCode } = await mp.onExit;
    expect(exitCode).toBe(0);
    expect(chunks.join("").trim()).toBe("hello from stdin");
  });

  it("can be killed", async () => {
    const mp = new ManagedProcess({
      id: "test-5",
      phase: "implement",
      bin: "sleep",
      args: ["60"],
      cwd: "/tmp",
    });

    mp.kill();

    const { exitCode } = await mp.onExit;
    expect(exitCode).not.toBe(0);
  });
});
