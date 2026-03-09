export class MockRunLauncher {
    responses = new Map();
    launches = [];
    setResponse(phase, response) {
        this.responses.set(phase, response);
    }
    launch(params) {
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
            costUsd: response.costUsd,
        };
    }
}
