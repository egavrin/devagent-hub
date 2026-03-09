const PRIORITY_MAP = {
    "must-have": 0,
    "should-have": 1,
    "nice-to-have": 2,
};
/**
 * Generate a backlog of work items from a project brief.
 * Each feature becomes one BacklogItem, ordered by milestone and priority.
 */
export function seedBacklog(brief) {
    const items = [];
    // Build a map of feature name → milestone name for lookup
    const featureToMilestone = new Map();
    for (const milestone of brief.milestones) {
        for (const featureName of milestone.features) {
            featureToMilestone.set(featureName, milestone.name);
        }
    }
    // Build ordered milestone index for sorting
    const milestoneOrder = new Map();
    for (let i = 0; i < brief.milestones.length; i++) {
        milestoneOrder.set(brief.milestones[i].name, i);
    }
    // Track feature names we've already seen (for dependency tracking within milestones)
    const priorFeatureTitles = [];
    // Process features milestone by milestone, then any unassigned features
    const processedFeatures = new Set();
    for (const milestone of brief.milestones) {
        // Find features belonging to this milestone, sorted by priority
        const milestoneFeatures = brief.features
            .filter((f) => milestone.features.includes(f.name))
            .sort((a, b) => PRIORITY_MAP[a.priority] - PRIORITY_MAP[b.priority]);
        for (const feature of milestoneFeatures) {
            const title = `[${brief.name}] ${feature.name}`;
            const priority = PRIORITY_MAP[feature.priority] ?? 1;
            const body = buildBody(brief, feature, milestone.name);
            const labels = buildLabels(milestone.name, feature.priority);
            // Dependencies: all prior features in the same milestone with higher or equal priority
            const dependencies = [...priorFeatureTitles];
            items.push({
                title,
                body,
                labels,
                milestone: milestone.name,
                priority,
                dependencies: dependencies.length > 0 ? [dependencies[dependencies.length - 1]] : [],
            });
            priorFeatureTitles.push(title);
            processedFeatures.add(feature.name);
        }
    }
    // Process features not assigned to any milestone
    const unassigned = brief.features.filter((f) => !processedFeatures.has(f.name));
    for (const feature of unassigned) {
        const title = `[${brief.name}] ${feature.name}`;
        const priority = PRIORITY_MAP[feature.priority] ?? 1;
        const body = buildBody(brief, feature);
        const labels = buildLabels(undefined, feature.priority);
        items.push({
            title,
            body,
            labels,
            priority,
            dependencies: [],
        });
    }
    return items;
}
function buildBody(brief, feature, milestoneName) {
    const parts = [];
    parts.push(`## ${feature.name}`);
    parts.push("");
    if (feature.description) {
        parts.push(feature.description);
        parts.push("");
    }
    parts.push(`**Priority:** ${feature.priority}`);
    if (milestoneName) {
        parts.push(`**Milestone:** ${milestoneName}`);
    }
    parts.push(`**Project:** ${brief.name}`);
    if (brief.techStack.length > 0) {
        parts.push(`**Tech Stack:** ${brief.techStack.join(", ")}`);
    }
    return parts.join("\n");
}
function buildLabels(milestoneName, priority) {
    const labels = ["devagent"];
    if (milestoneName) {
        labels.push(milestoneName);
    }
    labels.push(priority);
    return labels;
}
