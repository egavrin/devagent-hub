# Runner Integration

All stage executors must implement `RunnerAdapter` from `src/runner/runner-adapter.ts`:

```typescript
interface RunnerAdapter {
  readonly id: string;     // unique key, e.g. "opencode", "claude", "codex"
  readonly name: string;   // human-readable
  launch(params: LaunchParams): LaunchResult | Promise<LaunchResult>;
  describe(): RunnerCapabilities | null;
}
```

## Rules

- `launch()` must return `{ exitCode, outputPath, eventsPath, output }` — never throw.
- Write input JSON to `<artifactsDir>/<runId>/<phase>-input.json` before executing.
- Write parsed output to `<phase>-output.json` and raw events to `<phase>-events.jsonl`.
- Parse the agent's text response into structured JSON matching the phase schema. Handle markdown fences, extract `{...}` from free text.
- Return `exitCode: 2` for unsupported phases, not an exception.
- `describe()` shells out to `<bin> --version` with a 5s timeout. Returns `null` on failure.
- Register bin names in `LauncherFactory` (`OPENCODE_BINS`, `CLAUDE_BINS`, `CODEX_BINS` sets) and add detection in `isXxxBin()`, `createAdapter()`, `createStreamingAdapter()`, and `describeRunners()`.
- Runners that don't support streaming return the sync adapter from `createStreamingAdapter()`.

## Phase prompts

Each phase prompt must instruct the agent to output ONLY valid JSON with the fields expected by the orchestrator. See `PHASE_PROMPTS` in existing runners for the exact schemas per phase (triage, plan, implement, verify, review, repair, gate).

## Testing

Add a test in `src/__tests__/selection-policy.test.ts` confirming `factory.getLauncher(phase).id` returns the correct runner id for the new bin.
