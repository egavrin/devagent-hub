export interface GitHubIssue {
    number: number;
    title: string;
    body: string;
    labels: string[];
    url: string;
    state: "open" | "closed";
    author: string;
    createdAt: string;
    comments: GitHubComment[];
}
export interface GitHubComment {
    id: number;
    author: string;
    body: string;
    createdAt: string;
    /** GraphQL node_id — needed to resolve review threads. */
    nodeId?: string;
}
export interface GitHubPR {
    number: number;
    title: string;
    body: string;
    url: string;
    state: "open" | "closed" | "merged";
    draft: boolean;
    head: string;
    base: string;
    checks: GitHubCheck[];
    reviewComments: GitHubComment[];
}
export interface GitHubCheck {
    name: string;
    status: "queued" | "in_progress" | "completed";
    conclusion: "success" | "failure" | "neutral" | "cancelled" | "skipped" | null;
}
export interface CreatePRParams {
    title: string;
    body: string;
    head: string;
    base: string;
    draft: boolean;
}
