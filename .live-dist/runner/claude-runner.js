import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { buildSkillContext } from "./skill-prompt.js";
/**
 * Prompt templates for each workflow phase.
 * Same prompts as OpenCodeRunner — Claude Code uses natural language input.
 */
const PHASE_PROMPTS = {
    triage: (input) => `Triage this GitHub issue and produce a structured analysis.

Issue #${input.issueNumber}: ${input.title}
${input.body ?? ""}

Labels: ${input.labels?.join(", ") ?? "none"}

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
        const commands = input.commands ?? [];
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
/**
 * Runner adapter for Claude Code CLI.
 * Uses `claude -p` (print mode) with `--output-format json` for structured output.
 */
export class ClaudeRunner {
    id = "claude";
    name = "Claude Code";
    config;
    artifactsDir;
    constructor(config) {
        this.config = config;
        this.artifactsDir = config.artifactsDir ?? join(homedir(), ".config", "devagent-hub", "artifacts");
    }
    launch(params) {
        const { phase, repoPath, runId, input } = params;
        const promptBuilder = PHASE_PROMPTS[phase];
        if (!promptBuilder) {
            return { exitCode: 2, outputPath: "", eventsPath: "", output: null };
        }
        const prompt = promptBuilder(input)
            + buildSkillContext(input, repoPath);
        const runDir = join(this.artifactsDir, runId);
        mkdirSync(runDir, { recursive: true });
        const inputPath = join(runDir, `${phase}-input.json`);
        const outputPath = join(runDir, `${phase}-output.json`);
        const eventsPath = join(runDir, `${phase}-events.jsonl`);
        writeFileSync(inputPath, JSON.stringify(input, null, 2));
        // Build claude command: claude -p --output-format json --permission-mode bypassPermissions
        const binParts = this.config.bin.split(/\s+/);
        const args = [
            ...binParts.slice(1),
            "-p", // print mode (non-interactive)
            "--output-format", "json",
            "--permission-mode", this.config.permissionMode ?? "bypassPermissions",
        ];
        args.push("--model", this.config.model ?? "sonnet");
        // Prompt goes last
        args.push(prompt);
        let exitCode = 0;
        let rawOutput = "";
        try {
            // Strip CLAUDECODE env var to allow nesting (claude detects parent sessions)
            const env = { ...process.env };
            delete env.CLAUDECODE;
            rawOutput = execFileSync(binParts[0], args, {
                encoding: "utf-8",
                timeout: this.config.timeout ?? 15 * 60 * 1000,
                cwd: repoPath,
                maxBuffer: 10 * 1024 * 1024,
                env,
            });
        }
        catch (err) {
            exitCode = err?.status ?? 1;
            rawOutput = err?.stdout ?? "";
            const stderr = err?.stderr ?? "";
            if (stderr) {
                process.stderr.write(`[claude] ${phase} stderr: ${stderr.slice(0, 500)}\n`);
            }
        }
        // Parse output — claude --output-format json returns { result, ... }
        let output = null;
        try {
            output = this.extractJsonOutput(rawOutput);
        }
        catch {
            process.stderr.write(`[claude] Failed to parse ${phase} output\n`);
        }
        if (output) {
            writeFileSync(outputPath, JSON.stringify(output, null, 2));
        }
        writeFileSync(eventsPath, rawOutput);
        return { exitCode, outputPath, eventsPath, output };
    }
    describe() {
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
                availableProviders: ["anthropic"],
                supportedApprovalModes: ["full-auto"],
                supportedReasoningLevels: ["low", "medium", "high"],
            };
        }
        catch {
            return null;
        }
    }
    health() {
        return null;
    }
    cancel(_runId) {
        return false;
    }
    /**
     * Extract structured JSON from Claude Code's output.
     * With --output-format json, Claude returns { result: "...", ... }.
     * The result field contains the model's text response which should be our JSON.
     */
    extractJsonOutput(raw) {
        // Try parsing the whole output as JSON (claude --output-format json)
        try {
            const envelope = JSON.parse(raw);
            // Claude Code JSON output has a "result" field with the text content
            if (envelope.result) {
                return this.parseJsonFromText(envelope.result);
            }
            // If no result field, the envelope itself might be the output
            return envelope;
        }
        catch { /* continue */ }
        // Fallback: try extracting JSON from raw text
        return this.parseJsonFromText(raw);
    }
    parseJsonFromText(text) {
        try {
            return JSON.parse(text);
        }
        catch { /* continue */ }
        const fenceMatch = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
        if (fenceMatch)
            return JSON.parse(fenceMatch[1]);
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end > start)
            return JSON.parse(text.slice(start, end + 1));
        throw new Error("No JSON found in output");
    }
}
