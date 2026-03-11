import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "SUPPORT.md",
  "AGENTS.md",
  "CLAUDE.md",
  "REVIEW.md",
  "WORKFLOW.md",
  "BASELINE_VALIDATION.md",
  "docs/oss-readiness.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/feature_request.md",
  ".github/pull_request_template.md",
];

const docsToScan = [
  "README.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "REVIEW.md",
  "WORKFLOW.md",
  "SECURITY.md",
  "SUPPORT.md",
  "BASELINE_VALIDATION.md",
  "docs/oss-readiness.md",
  "CLAUDE.md",
];

const forbidden = [
  { label: "/Users/", test: (body) => body.includes("/Users/") },
  { label: "devagent workflow run", test: (body) => body.includes("devagent workflow run") },
  { label: "workflow run --phase", test: (body) => body.includes("workflow run --phase") },
  { label: "devagent-hub ui", test: (body) => body.includes("devagent-hub ui") },
  { label: "devagent-hub tui", test: (body) => body.includes("devagent-hub tui") },
  { label: "src/state", test: (body) => /(^|[^/\\w-])src\/state(\/|[^\\w-]|$)/.test(body) },
  { label: "src/runner", test: (body) => /(^|[^/\\w-])src\/runner(\/|[^\\w-]|$)/.test(body) },
  { label: "src/workspace", test: (body) => /(^|[^/\\w-])src\/workspace(\/|[^\\w-]|$)/.test(body) },
  { label: "WorkflowOrchestrator", test: (body) => body.includes("WorkflowOrchestrator") },
  { label: "RunLauncher", test: (body) => body.includes("RunLauncher") },
  { label: "WorktreeManager", test: (body) => body.includes("WorktreeManager") },
];

const missing = requiredFiles.filter((file) => !existsSync(join(root, file)));
if (missing.length > 0) {
  console.error(`Missing required OSS files:\n- ${missing.join("\n- ")}`);
  process.exit(1);
}

for (const file of docsToScan) {
  const body = readFileSync(join(root, file), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(body)) {
      console.error(`Forbidden public-docs reference "${pattern.label}" found in ${file}`);
      process.exit(1);
    }
  }
}

console.log("OSS readiness checks passed.");
