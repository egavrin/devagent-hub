/** Status sets for availability predicates */
const APPROVABLE = ["plan_draft", "plan_revision", "awaiting_human_review", "ready_to_merge"];
const CONTINUABLE = [
    "new", "triaged", "plan_draft", "plan_revision", "plan_accepted",
    "awaiting_local_verify", "draft_pr_opened", "auto_review_fix_loop",
    "awaiting_human_review", "ready_to_merge",
];
const TERMINAL = ["done", "failed", "escalated"];
const REWORKABLE = ["plan_draft"];
const ALL_SCREENS = ["dashboard", "run", "approvals", "runners", "autopilot", "settings"];
const ACTION_SCREENS = ["dashboard", "run", "approvals"];
/**
 * Build the full action registry.
 * Accepts execute callbacks that are wired by the App component.
 */
export function buildActions(handlers) {
    const h = (id) => handlers[id] ?? (() => { });
    return [
        // ─── Run actions ──────────────────────────────────
        {
            id: "approve",
            label: "Approve",
            hotkey: "A",
            keywords: ["approve", "accept", "ok", "plan", "review", "merge"],
            screens: ACTION_SCREENS,
            available: (ctx) => ctx.hasSelectedRun && ctx.runStatus !== null && APPROVABLE.includes(ctx.runStatus),
            suggested: (ctx) => ctx.runStatus !== null && (ctx.runStatus === "plan_draft" || ctx.runStatus === "plan_revision"),
            execute: h("approve"),
        },
        {
            id: "continue",
            label: "Continue",
            hotkey: "C",
            keywords: ["continue", "next", "proceed", "advance"],
            screens: ACTION_SCREENS,
            available: (ctx) => ctx.hasSelectedRun && ctx.runStatus !== null && CONTINUABLE.includes(ctx.runStatus),
            suggested: (ctx) => ctx.runStatus !== null && ["new", "triaged", "plan_accepted", "awaiting_local_verify"].includes(ctx.runStatus),
            execute: h("continue"),
        },
        {
            id: "rework",
            label: "Rework",
            hotkey: "W",
            keywords: ["rework", "revise", "feedback", "reject"],
            screens: ACTION_SCREENS,
            available: (ctx) => ctx.hasSelectedRun && ctx.runStatus !== null && REWORKABLE.includes(ctx.runStatus),
            execute: h("rework"),
        },
        {
            id: "retry",
            label: "Retry",
            hotkey: "r",
            keywords: ["retry", "again", "redo"],
            screens: ACTION_SCREENS,
            available: (ctx) => ctx.hasSelectedRun && (ctx.runStatus === "failed" || ctx.runStatus === "awaiting_human_review"),
            suggested: (ctx) => ctx.runStatus === "failed",
            execute: h("retry"),
        },
        {
            id: "rerun",
            label: "Rerun with profile",
            hotkey: "R",
            keywords: ["rerun", "profile", "switch", "model"],
            screens: ["run"],
            available: (ctx) => ctx.hasSelectedRun && ctx.hasConfig,
            execute: h("rerun"),
        },
        {
            id: "kill",
            label: "Kill process",
            hotkey: "K",
            keywords: ["kill", "stop", "abort", "terminate"],
            screens: ["run"],
            available: (ctx) => ctx.hasActiveProcess,
            execute: h("kill"),
        },
        {
            id: "pause",
            label: "Pause",
            hotkey: "P",
            keywords: ["pause", "hold", "wait", "suspend"],
            screens: ["run"],
            available: (ctx) => ctx.hasSelectedRun && ctx.runStatus !== null && !TERMINAL.includes(ctx.runStatus),
            execute: h("pause"),
        },
        {
            id: "escalate",
            label: "Escalate",
            hotkey: "E",
            keywords: ["escalate", "human", "help", "stuck"],
            screens: ACTION_SCREENS,
            available: (ctx) => ctx.hasSelectedRun && ctx.runStatus !== null && !TERMINAL.includes(ctx.runStatus),
            execute: h("escalate"),
        },
        {
            id: "delete",
            label: "Delete run",
            hotkey: "D",
            keywords: ["delete", "remove", "drop"],
            screens: ACTION_SCREENS,
            available: (ctx) => ctx.hasSelectedRun,
            execute: h("delete"),
        },
        {
            id: "take-over",
            label: "Take over",
            hotkey: "T",
            keywords: ["take", "over", "worktree", "manual", "takeover"],
            screens: ACTION_SCREENS,
            available: (ctx) => ctx.hasSelectedRun,
            suggested: (ctx) => ctx.runStatus === "escalated",
            execute: h("take-over"),
        },
        {
            id: "open-pr",
            label: "Open PR",
            hotkey: "O",
            keywords: ["open", "pr", "url", "browser", "github"],
            screens: ACTION_SCREENS,
            available: (ctx) => ctx.hasPrUrl,
            execute: h("open-pr"),
        },
        // ─── Navigation ───────────────────────────────────
        {
            id: "new-run",
            label: "New run",
            hotkey: "N",
            keywords: ["new", "create", "start", "run"],
            screens: ["dashboard"],
            available: () => true,
            execute: h("new-run"),
        },
        {
            id: "approvals",
            label: "Approval inbox",
            hotkey: "V",
            keywords: ["approvals", "inbox", "pending", "queue"],
            screens: ["dashboard"],
            available: () => true,
            execute: h("approvals"),
        },
        {
            id: "runners",
            label: "Runners",
            hotkey: "M",
            keywords: ["runners", "agents", "machines"],
            screens: ["dashboard"],
            available: () => true,
            execute: h("runners"),
        },
        {
            id: "autopilot",
            label: "Toggle autopilot",
            hotkey: "X",
            keywords: ["autopilot", "auto", "daemon", "toggle"],
            screens: ["dashboard", "autopilot"],
            available: () => true,
            execute: h("autopilot"),
        },
        {
            id: "settings",
            label: "Settings",
            hotkey: ",",
            keywords: ["settings", "config", "preferences"],
            screens: ["dashboard"],
            available: (ctx) => ctx.hasConfig,
            execute: h("settings"),
        },
        {
            id: "filter",
            label: "Filter",
            hotkey: "/",
            keywords: ["filter", "search", "find"],
            screens: ["dashboard"],
            available: () => true,
            execute: h("filter"),
        },
        {
            id: "help",
            label: "Help",
            hotkey: "?",
            keywords: ["help", "keys", "shortcuts", "bindings"],
            screens: ALL_SCREENS,
            available: () => true,
            execute: h("help"),
        },
        {
            id: "command-palette",
            label: "Commands",
            hotkey: ".",
            keywords: ["commands", "palette", "search"],
            screens: ALL_SCREENS,
            available: () => true,
            execute: h("command-palette"),
        },
    ];
}
/**
 * Get the suggested action for the current context.
 */
export function getSuggestedAction(actions, ctx) {
    return actions.find((a) => a.suggested?.(ctx) && a.available(ctx)) ?? null;
}
/**
 * Get actions available for the current context, suitable for footer hints.
 */
export function getAvailableActions(actions, ctx) {
    return actions.filter((a) => a.screens.includes(ctx.screen) && a.available(ctx));
}
/**
 * Get actions for the command palette (all actions, filtered by screen).
 */
export function getPaletteActions(actions, ctx) {
    return actions.filter((a) => a.available(ctx));
}
