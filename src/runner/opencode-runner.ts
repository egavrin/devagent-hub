import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { RunnerAdapter, LaunchParams, RunnerCapabilities } from "./runner-adapter.js";
import type { LaunchResult } from "./launcher.js";
import { buildSkillContext } from "./skill-prompt.js";

/**
 * Prompt templates for each workflow phase.
 * OpenCode doesn't have devagent's `workflow run` contract,
 * so we translate each phase into a natural language prompt.
 */
const PHASE_PROMPTS: Record<string, (input: Record<string, unknown>) => string> = {
  triage: (input) => `Triage this GitHub issue and produce a structured analysis.

Issue #${input.issueNumber}: ${input.title}
${input.body ?? ""}

Labels: ${(input.labels as string[])?.join(", ") ?? "none"}

Respond with a JSON object containing:
- summary: brief summary of the issue
- complexity: one of "trivial", "small", "medium", "large", "epic"
- suggestedLabels: array of suggested labels
- relatedFiles: array of potentially related file paths
- blockers: array of any blocking concerns

Output ONLY valid JSON, no markdown fences.`,

  plan: (input) => `Create an implementation plan for this issue.

Issue #${input.issueNumber}: ${input.title}
${input.body ?? ""}

${input.triageReport ? `Triage report: ${JSON.stringify(input.triageReport)}` : ""}

Respond with a JSON object containing:
- summary: brief plan summary
- steps: array of { description, file, type } where type is "create"|"modify"|"delete"|"test"|"config"
- filesToCreate: array of new file paths
- filesToModify: array of existing file paths to change
- testStrategy: how to test the changes
- risks: array of risk descriptions

Output ONLY valid JSON, no markdown fences.`,

  implement: (input) => `Implement the following plan for issue #${input.issueNumber}.

${input.title ?? ""}
${input.body ?? ""}

Accepted plan: ${JSON.stringify(input.acceptedPlan ?? {})}

Make all necessary code changes. After completing, respond with a JSON object containing:
- summary: what was implemented
- changedFiles: array of changed file paths
- suggestedCommitMessage: a conventional commit message
- diffSummary: brief description of the diff

Output ONLY valid JSON, no markdown fences.`,

  verify: (input) => {
    const commands = (input.commands as string[]) ?? [];
    return `Run these verification commands and report results:

${commands.map((c) => `- ${c}`).join("\n")}

Respond with a JSON object containing:
- summary: overall verification summary
- passed: boolean indicating if all checks passed
- results: array of { command, exitCode, stdout, stderr, passed }

Output ONLY valid JSON, no markdown fences.`;
  },

  review: (input) => `Review the code changes for issue #${input.issueNumber}.

${input.diff ? `Diff:\n${input.diff}` : "Review the current branch changes."}

Respond with a JSON object containing:
- summary: review summary
- verdict: "pass" or "block"
- findings: array of { file, line, severity, message, category } where severity is "critical"|"major"|"minor"|"suggestion"
- blockingCount: number of blocking findings

Output ONLY valid JSON, no markdown fences.`,

  repair: (input) => `Fix the following review findings for issue #${input.issueNumber} (repair round ${input.round ?? 1}).

Findings to fix:
${JSON.stringify(input.findings ?? [])}

${input.ciFailures ? `CI failures:\n${JSON.stringify(input.ciFailures)}` : ""}

Make the necessary code changes, then respond with a JSON object containing:
- summary: what was fixed
- fixedFindings: array of finding descriptions that were fixed
- remainingFindings: number of findings not yet fixed
- verificationPassed: boolean
- changedFiles: array of changed file paths

Output ONLY valid JSON, no markdown fences.`,

  gate: (input) => `Evaluate the quality of the ${input.sourcePhase} stage output for issue #${input.issueNumber}.

Stage output: ${JSON.stringify(input.stageOutput ?? {})}

Respond with a JSON object containing:
- summary: evaluation summary
- verdict: "pass" or "block"
- findings: array of { file, line, severity, message, category }
- blockingCount: number of blocking findings
- confidence: number between 0 and 1

Output ONLY valid JSON, no markdown fences.`,
};

export interface OpenCodeConfig {
  bin: string;
  model: string;
  artifactsDir?: string;
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * Runner adapter for OpenCode CLI.
 * Translates workflow phases into opencode `run` commands with structured prompts.
 * Uses DeepSeek (or any configured model) via opencode's --model flag.
 */
export class OpenCodeRunner implements RunnerAdapter {
  readonly id = "opencode";
  readonly name = "OpenCode";
  private config: OpenCodeConfig;
  private artifactsDir: string;

  constructor(config: OpenCodeConfig) {
    this.config = config;
    this.artifactsDir = config.artifactsDir ?? join(homedir(), ".config", "devagent-hub", "artifacts");
  }

  launch(params: LaunchParams): LaunchResult {
    const { phase, repoPath, runId, input } = params;

    // Build prompt for the phase
    const promptBuilder = PHASE_PROMPTS[phase];
    if (!promptBuilder) {
      return {
        exitCode: 2,
        outputPath: "",
        eventsPath: "",
        output: null,
      };
    }

    const prompt = promptBuilder(input as Record<string, unknown>)
      + buildSkillContext(input as Record<string, unknown>, repoPath);

    // Create run dir
    const runDir = join(this.artifactsDir, runId);
    mkdirSync(runDir, { recursive: true });

    const inputPath = join(runDir, `${phase}-input.json`);
    const outputPath = join(runDir, `${phase}-output.json`);
    const eventsPath = join(runDir, `${phase}-events.jsonl`);

    writeFileSync(inputPath, JSON.stringify(input, null, 2));

    // Build opencode command
    const binParts = this.config.bin.split(/\s+/);
    const args = [
      ...binParts.slice(1),
      "run",
      prompt,
      "--model", this.config.model,
      "--format", "json",
    ];

    const env = {
      ...process.env,
      ...this.config.env,
    };

    let exitCode = 0;
    let rawOutput = "";

    try {
      rawOutput = execFileSync(binParts[0], args, {
        encoding: "utf-8",
        timeout: this.config.timeout ?? 15 * 60 * 1000,
        cwd: repoPath,
        env,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err: unknown) {
      exitCode = (err as { status?: number })?.status ?? 1;
      rawOutput = (err as { stdout?: string })?.stdout ?? "";
      const stderr = (err as { stderr?: string })?.stderr ?? "";
      if (stderr) {
        process.stderr.write(`[opencode] ${phase} stderr: ${stderr.slice(0, 500)}\n`);
      }
    }

    // Parse output — opencode with --format json emits JSON events, one per line.
    // We need to find the text output event containing our JSON response.
    let output: unknown = null;
    try {
      output = this.extractJsonOutput(rawOutput);
    } catch {
      process.stderr.write(`[opencode] Failed to parse ${phase} output\n`);
    }

    if (output) {
      writeFileSync(outputPath, JSON.stringify(output, null, 2));
    }

    // Write raw events
    writeFileSync(eventsPath, rawOutput);

    return { exitCode, outputPath, eventsPath, output };
  }

  describe(): RunnerCapabilities | null {
    // Check if opencode binary exists
    const binParts = this.config.bin.split(/\s+/);
    try {
      const raw = execFileSync(binParts[0], [...binParts.slice(1), "--version"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      const version = raw.trim();
      return {
        version,
        supportedPhases: Object.keys(PHASE_PROMPTS),
        availableProviders: ["deepseek", "openai", "anthropic"],
        supportedApprovalModes: ["full-auto"],
        supportedReasoningLevels: [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract JSON output from opencode's JSON event stream.
   * Events are newline-delimited JSON objects with { type, ... }.
   * We look for the text event containing our structured response.
   */
  private extractJsonOutput(raw: string): unknown {
    const lines = raw.trim().split("\n").filter(Boolean);

    // Try to find a text event with JSON content
    for (const line of lines.reverse()) {
      try {
        const event = JSON.parse(line);
        if (event.type === "text" && event.part?.text) {
          // The text might contain our JSON response
          return this.parseJsonFromText(event.part.text);
        }
      } catch {
        continue;
      }
    }

    // Fallback: try the entire output as JSON
    return this.parseJsonFromText(raw);
  }

  /** Parse JSON from text that might have markdown fences or extra content. */
  private parseJsonFromText(text: string): unknown {
    // Try direct parse
    try {
      return JSON.parse(text);
    } catch { /* continue */ }

    // Try extracting from markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (fenceMatch) {
      return JSON.parse(fenceMatch[1]);
    }

    // Try finding first { to last }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error("No JSON found in output");
  }
}
