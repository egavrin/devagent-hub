export class MockGitHubGateway {
    issues = new Map();
    prs = new Map();
    pushedBranches = [];
    nextCommentId = 1;
    nextPRNumber = 100;
    issueKey(repo, number) {
        return `${repo}#${number}`;
    }
    /** Seed an issue into the mock store. */
    seedIssue(repo, issue) {
        this.issues.set(this.issueKey(repo, issue.number), issue);
    }
    /** Seed a PR into the mock store. */
    seedPR(repo, pr) {
        this.prs.set(this.issueKey(repo, pr.number), pr);
    }
    async fetchIssue(repo, number) {
        const issue = this.issues.get(this.issueKey(repo, number));
        if (!issue) {
            throw new Error(`Issue ${repo}#${number} not found`);
        }
        return issue;
    }
    async fetchEligibleIssues(repo, labels) {
        const results = [];
        for (const [key, issue] of this.issues) {
            if (!key.startsWith(`${repo}#`))
                continue;
            if (issue.state !== "open")
                continue;
            if (labels.some((l) => issue.labels.includes(l))) {
                results.push(issue);
            }
        }
        return results;
    }
    async addComment(repo, issueNumber, body) {
        const issue = await this.fetchIssue(repo, issueNumber);
        const comment = {
            id: this.nextCommentId++,
            author: "mock-bot",
            body,
            createdAt: new Date().toISOString(),
        };
        issue.comments.push(comment);
    }
    async addLabels(repo, issueNumber, labels) {
        const issue = await this.fetchIssue(repo, issueNumber);
        for (const label of labels) {
            if (!issue.labels.includes(label)) {
                issue.labels.push(label);
            }
        }
    }
    async removeLabels(repo, issueNumber, labels) {
        const issue = await this.fetchIssue(repo, issueNumber);
        issue.labels = issue.labels.filter((l) => !labels.includes(l));
    }
    async createPR(repo, params) {
        const number = this.nextPRNumber++;
        const pr = {
            number,
            title: params.title,
            body: params.body,
            url: `https://github.com/${repo}/pull/${number}`,
            state: "open",
            draft: params.draft,
            head: params.head,
            base: params.base,
            checks: [],
            reviewComments: [],
        };
        this.prs.set(this.issueKey(repo, number), pr);
        return pr;
    }
    async fetchPR(repo, number) {
        const pr = this.prs.get(this.issueKey(repo, number));
        if (!pr) {
            throw new Error(`PR ${repo}#${number} not found`);
        }
        return pr;
    }
    async fetchPRChecks(repo, prNumber) {
        const pr = await this.fetchPR(repo, prNumber);
        return pr.checks;
    }
    async fetchPRReviewComments(repo, prNumber) {
        const pr = await this.fetchPR(repo, prNumber);
        return pr.reviewComments;
    }
    resolvedThreads = [];
    conflictResults = new Map();
    async resolveReviewThreads(_repo, _prNumber, commentNodeIds) {
        this.resolvedThreads.push(...commentNodeIds);
    }
    async checkBranchConflicts(_repoPath, branch, _base) {
        return this.conflictResults.get(branch) ?? { conflicted: false, conflictFiles: [] };
    }
    readiedPRs = [];
    ciFailureLogs = [];
    async markPRReady(_repo, prNumber) {
        this.readiedPRs.push(prNumber);
        const pr = [...this.prs.values()].find((p) => p.number === prNumber);
        if (pr)
            pr.draft = false;
    }
    async fetchCIFailureLogs(_repo, _prNumber) {
        return this.ciFailureLogs;
    }
    createdIssues = [];
    nextIssueNumber = 1;
    async createIssue(repo, params) {
        const number = this.nextIssueNumber++;
        const url = `https://github.com/${repo}/issues/${number}`;
        this.createdIssues.push({
            repo,
            title: params.title,
            body: params.body,
            labels: params.labels ?? [],
            number,
            url,
        });
        // Also seed the issue so it can be fetched later
        this.seedIssue(repo, {
            number,
            title: params.title,
            body: params.body,
            labels: params.labels ?? [],
            url,
            state: "open",
            author: "mock-bot",
            createdAt: new Date().toISOString(),
            comments: [],
        });
        return { number, url };
    }
    async pushBranch(repoPath, branch, _commitMessage) {
        this.pushedBranches.push({ repoPath, branch });
    }
}
