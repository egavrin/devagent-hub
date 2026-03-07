import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Loads SKILL.md content for each skill name from the repo's .agents/skills/ directory.
 * Returns a formatted string to append to prompts, or empty string if no skills.
 */
export function buildSkillContext(input: Record<string, unknown>, repoPath: string): string {
  const skills = input.skills as string[] | undefined;
  if (!skills || skills.length === 0) return "";

  const sections: string[] = [];
  for (const skill of skills) {
    const skillPath = join(repoPath, ".agents", "skills", skill, "SKILL.md");
    try {
      const content = readFileSync(skillPath, "utf-8");
      sections.push(`### Skill: ${skill}\n${content.trim()}`);
    } catch {
      // Skill file not found — just mention it by name
      sections.push(`### Skill: ${skill}\n(Apply ${skill} best practices)`);
    }
  }

  return `\n\n## Active Skills\n${sections.join("\n\n")}`;
}
