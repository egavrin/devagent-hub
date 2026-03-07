import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { RunnerAdapter, LaunchParams, RunnerCapabilities } from "./runner-adapter.js";
import type { LaunchResult } from "./launcher.js";

/**
 * Prompt templates for each workflow phase.
 * Codex uses `exec` subcommand for non-interactive runs.
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

export interface CodexRunnerConfig {
  bin: string;
  model?: string;
  artifactsDir?: string;
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * Runner adapter for OpenAI Codex CLI (@openai/codex).
 * Uses `codex exec` for non-interactive runs with `--json` for structured output.
 */
export class CodexRunner implements RunnerAdapter {
  readonly id = "codex";
  readonly name = "Codex";
  private config: CodexRunnerConfig;
  private artifactsDir: string;

  constructor(config: CodexRunnerConfig) {
    this.config = config;
    this.artifactsDir = config.artifactsDir ?? join(homedir(), ".config", "devagent-hub", "artifacts");
  }

  launch(params: LaunchParams): LaunchResult {
    const { phase, repoPath, runId, input } = params;

    const promptBuilder = PHASE_PROMPTS[phase];
    if (!promptBuilder) {
      return { exitCode: 2, outputPath: "", eventsPath: "", output: null };
    }

    const prompt = promptBuilder(input as Record<string, unknown>);

    const runDir = join(this.artifactsDir, runId);
    mkdirSync(runDir, { recursive: true });

    const inputPath = join(runDir, `${phase}-input.json`);
    const outputPath = join(runDir, `${phase}-output.json`);
    const eventsPath = join(runDir, `${phase}-events.jsonl`);
    const lastMsgPath = join(runDir, `${phase}-last-message.txt`);

    writeFileSync(inputPath, JSON.stringify(input, null, 2));

    // Build codex command: codex exec --full-auto --json -C repoPath -o lastMsgPath "prompt"
    const binParts = this.config.bin.split(/\s+/);
    const args = [
      ...binParts.slice(1),
      "exec",
      "--full-auto",
      "--json",                          // JSONL event output on stdout
      "-C", repoPath,
      "-o", lastMsgPath,                 // last message written to file
    ];

    args.push("-m", this.config.model ?? "gpt-5.3-codex");

    // Prompt goes last
    args.push(prompt);

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
        process.stderr.write(`[codex] ${phase} stderr: ${stderr.slice(0, 500)}\n`);
      }
    }

    // Parse output — codex --json emits JSONL events.
    // The -o flag writes the last agent message to a file, which is our primary source.
    let output: unknown = null;
    try {
      output = this.extractJsonOutput(rawOutput, lastMsgPath);
    } catch {
      process.stderr.write(`[codex] Failed to parse ${phase} output\n`);
    }

    if (output) {
      writeFileSync(outputPath, JSON.stringify(output, null, 2));
    }
    writeFileSync(eventsPath, rawOutput);

    return { exitCode, outputPath, eventsPath, output };
  }

  describe(): RunnerCapabilities | null {
    const binParts = this.config.bin.split(/\s+/);
    try {
      const raw = execFileSync(binParts[0], [...binParts.slice(1), "--version"], {
        encoding: "utf-8",
        timeout: 5000,
      });
      const version = raw.trim().replace(/^codex-cli\s*/, "");
      return {
        version,
        supportedPhases: Object.keys(PHASE_PROMPTS),
        availableProviders: ["openai"],
        supportedApprovalModes: ["full-auto"],
        supportedReasoningLevels: [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract JSON from Codex output.
   * Primary: read the -o last-message file.
   * Fallback: parse JSONL events from stdout.
   */
  private extractJsonOutput(raw: string, lastMsgPath: string): unknown {
    // Try reading last message file first
    try {
      const lastMsg = readFileSync(lastMsgPath, "utf-8");
      if (lastMsg.trim()) {
        return this.parseJsonFromText(lastMsg);
      }
    } catch { /* continue */ }

    // Fallback: parse JSONL events looking for message content
    const lines = raw.trim().split("\n").filter(Boolean);
    for (const line of lines.reverse()) {
      try {
        const event = JSON.parse(line);
        // Codex JSONL events have various types; look for message/text content
        const text = event.message?.content ?? event.content ?? event.text;
        if (typeof text === "string" && text.includes("{")) {
          return this.parseJsonFromText(text);
        }
      } catch { continue; }
    }

    return this.parseJsonFromText(raw);
  }

  private parseJsonFromText(text: string): unknown {
    try { return JSON.parse(text); } catch { /* continue */ }

    const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (fenceMatch) return JSON.parse(fenceMatch[1]);

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(text.slice(start, end + 1));

    throw new Error("No JSON found in output");
  }
}
