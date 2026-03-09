import type { ProjectBrief } from "./project-brief.js";
export interface BacklogItem {
    title: string;
    body: string;
    labels: string[];
    milestone?: string;
    priority: number;
    dependencies: string[];
}
/**
 * Generate a backlog of work items from a project brief.
 * Each feature becomes one BacklogItem, ordered by milestone and priority.
 */
export declare function seedBacklog(brief: ProjectBrief): BacklogItem[];
