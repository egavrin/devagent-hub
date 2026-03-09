import { readFileSync } from "node:fs";
const PRIORITY_PATTERN = /\(must-have\)|\(should-have\)|\(nice-to-have\)/;
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
export function parseProjectBrief(markdown) {
    const lines = markdown.split("\n");
    let name = "";
    let description = "";
    const goals = [];
    const constraints = [];
    const techStack = [];
    const features = [];
    const milestones = [];
    let currentSection = "none";
    let currentFeature = null;
    let currentMilestone = null;
    const descriptionLines = [];
    for (const line of lines) {
        const trimmed = line.trim();
        // Top-level heading: project name
        if (/^# /.test(trimmed) && !/^## /.test(trimmed)) {
            name = trimmed.replace(/^# /, "").trim();
            currentSection = "description";
            continue;
        }
        // Section headings (##)
        if (/^## /.test(trimmed) && !/^### /.test(trimmed)) {
            // Flush current feature/milestone
            if (currentFeature) {
                features.push(currentFeature);
                currentFeature = null;
            }
            if (currentMilestone) {
                milestones.push(currentMilestone);
                currentMilestone = null;
            }
            const sectionName = trimmed.replace(/^## /, "").trim().toLowerCase();
            if (sectionName === "goals") {
                currentSection = "goals";
            }
            else if (sectionName === "constraints") {
                currentSection = "constraints";
            }
            else if (sectionName === "tech stack") {
                currentSection = "techstack";
            }
            else if (sectionName === "features") {
                currentSection = "features";
            }
            else if (sectionName === "milestones") {
                currentSection = "milestones";
            }
            else {
                currentSection = "none";
            }
            continue;
        }
        // Sub-section headings (###) inside features or milestones
        if (/^### /.test(trimmed)) {
            if (currentSection === "features") {
                // Flush previous feature
                if (currentFeature) {
                    features.push(currentFeature);
                }
                const headerText = trimmed.replace(/^### /, "").trim();
                const priorityMatch = headerText.match(PRIORITY_PATTERN);
                const priority = priorityMatch
                    ? priorityMatch[0].replace(/[()]/g, "")
                    : "should-have";
                const featureName = headerText.replace(PRIORITY_PATTERN, "").trim();
                currentFeature = { name: featureName, description: "", priority };
            }
            else if (currentSection === "milestones") {
                // Flush previous milestone
                if (currentMilestone) {
                    milestones.push(currentMilestone);
                }
                const milestoneName = trimmed.replace(/^### /, "").trim();
                currentMilestone = { name: milestoneName, features: [], description: "" };
            }
            continue;
        }
        // List items
        if (/^[-*] /.test(trimmed)) {
            const item = trimmed.replace(/^[-*] /, "").trim();
            if (currentSection === "goals") {
                goals.push(item);
            }
            else if (currentSection === "constraints") {
                constraints.push(item);
            }
            else if (currentSection === "techstack") {
                techStack.push(item);
            }
            else if (currentSection === "milestones" && currentMilestone) {
                currentMilestone.features.push(item);
            }
            continue;
        }
        // Non-list content
        if (currentSection === "description" && trimmed.length > 0) {
            descriptionLines.push(trimmed);
        }
        else if (currentSection === "features" && currentFeature && trimmed.length > 0) {
            currentFeature.description = currentFeature.description
                ? currentFeature.description + " " + trimmed
                : trimmed;
        }
        else if (currentSection === "milestones" && currentMilestone && trimmed.length > 0 && !/^[-*] /.test(trimmed)) {
            currentMilestone.description = currentMilestone.description
                ? currentMilestone.description + " " + trimmed
                : trimmed;
        }
    }
    // Flush any remaining feature or milestone
    if (currentFeature) {
        features.push(currentFeature);
    }
    if (currentMilestone) {
        milestones.push(currentMilestone);
    }
    description = descriptionLines.join(" ");
    return { name, description, goals, constraints, techStack, features, milestones };
}
/** Read and parse a project brief from a file path. */
export function loadProjectBrief(filePath) {
    const content = readFileSync(filePath, "utf-8");
    return parseProjectBrief(content);
}
