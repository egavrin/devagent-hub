import type { LaunchResult } from "./launcher.js";

export interface MockPhaseResponse {
  exitCode: number;
  output: unknown;
}

export class MockRunLauncher {
  responses: Map<string, MockPhaseResponse> = new Map();
  launches: Array<{
    phase: string;
    runId: string;
    input: unknown;
    repoPath: string;
  }> = [];

  setResponse(phase: string, response: MockPhaseResponse): void {
    this.responses.set(phase, response);
  }

  launch(params: {
    phase: string;
    repoPath: string;
    runId: string;
    input: unknown;
  }): LaunchResult {
    this.launches.push(params);
    const response = this.responses.get(params.phase) ?? {
      exitCode: 0,
      output: {
        schemaVersion: 1,
        phase: params.phase,
        result: {},
        summary: "Mock result",
      },
    };
    return {
      exitCode: response.exitCode,
      outputPath: `/tmp/mock/${params.runId}/${params.phase}-output.json`,
      eventsPath: `/tmp/mock/${params.runId}/${params.phase}-events.jsonl`,
      output: response.output,
    };
  }
}
