import { afterEach, describe, expect, it } from "vitest";
import { validateTaskExecutionEvent, validateTaskExecutionRequest, validateTaskExecutionResult } from "@devagent-sdk/validation";
import type { TaskExecutionEvent, TaskExecutionRequest, TaskExecutionResult } from "@devagent-sdk/types";
import { createCompatibilityService, fixturePath, readJson } from "../baseline/test-helpers.js";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

describe("baseline compatibility", () => {
  it("validates SDK fixtures and Hub-generated requests against the pinned contract", async () => {
    const goldenRequest = await readJson<TaskExecutionRequest>(fixturePath("request-golden.json"));
    const eventFixture = await readJson<TaskExecutionEvent>(fixturePath("event-progress.json"));
    const resultFixture = await readJson<TaskExecutionResult>(fixturePath("result-success.json"));

    expect(validateTaskExecutionRequest(goldenRequest)).toMatchObject({ taskId: "task-golden-1" });
    expect(validateTaskExecutionEvent(eventFixture)).toMatchObject({ type: "progress" });
    expect(validateTaskExecutionResult(resultFixture)).toMatchObject({ status: "success" });

    const { harness, store, service, runner } = await createCompatibilityService();
    cleanups.push(async () => {
      store.close();
      await harness.cleanup();
    });

    const started = await service.start("42");
    await service.resume(started.id);

    expect(runner.startedRequests.length).toBeGreaterThanOrEqual(5);
    for (const request of runner.startedRequests) {
      expect(validateTaskExecutionRequest(request)).toBe(request);
      expect(request.protocolVersion).toBe("0.1");
    }
  });
});
