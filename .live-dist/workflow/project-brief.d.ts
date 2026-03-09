export interface ProjectBrief {
    name: string;
    description: string;
    goals: string[];
    constraints: string[];
    techStack: string[];
    features: Feature[];
    milestones: Milestone[];
}
export interface Feature {
    name: string;
    description: string;
    priority: "must-have" | "should-have" | "nice-to-have";
}
export interface Milestone {
    name: string;
    features: string[];
    description: string;
}
/**
 * Parse a project brief markdown file into structured data.
 *
 * Expected format:
 * # Project Name
 * Description paragraph...
 *
 * ## Goals
 * - goal 1
 * - goal 2
 *
 * ## Constraints
 * - constraint 1
 *
 * ## Tech Stack
 * - TypeScript
 * - React
 *
 * ## Features
 * ### Feature Name (must-have|should-have|nice-to-have)
 * Description...
 *
 * ## Milestones
 * ### Milestone Name
 * - feature 1
 * - feature 2
 */
export declare function parseProjectBrief(markdown: string): ProjectBrief;
/** Read and parse a project brief from a file path. */
export declare function loadProjectBrief(filePath: string): ProjectBrief;
