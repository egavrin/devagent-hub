/**
 * Loads SKILL.md content for each skill name from the repo's .agents/skills/ directory.
 * Returns a formatted string to append to prompts, or empty string if no skills.
 */
export declare function buildSkillContext(input: Record<string, unknown>, repoPath: string): string;
