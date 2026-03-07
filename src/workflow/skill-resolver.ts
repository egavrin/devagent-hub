import type { WorkflowConfig } from "./config.js";

/**
 * Simple glob matching: supports * (any chars) and ** (any path segments).
 */
function matchGlob(pattern: string, path: string): boolean {
  const regex = pattern
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{GLOBSTAR}}/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${regex}$`).test(path);
}

/**
 * Resolves effective skills for a given stage and set of changed files.
 * Combines: defaults + stage-specific + path-override skills.
 */
export function resolveSkills(
  config: WorkflowConfig,
  phase: string,
  changedFiles?: string[],
): string[] {
  const skills = new Set<string>();

  // 1. Default skills
  for (const s of config.skills.defaults) {
    skills.add(s);
  }

  // 2. Stage-specific skills
  const stageSkills = config.skills.by_stage[phase];
  if (stageSkills) {
    for (const s of stageSkills) {
      skills.add(s);
    }
  }

  // 3. Path-override skills (match changed files against glob patterns)
  if (changedFiles && changedFiles.length > 0) {
    for (const [pattern, pathSkills] of Object.entries(config.skills.path_overrides)) {
      const matches = changedFiles.some((f) => matchGlob(pattern, f));
      if (matches) {
        for (const s of pathSkills) {
          skills.add(s);
        }
      }
    }
  }

  return [...skills];
}
