import { jsx as _jsx } from "react/jsx-runtime";
import { render } from "ink";
import { App } from "./app.js";
export function launchTUI(deps) {
    render(_jsx(App, { store: deps.store, registry: deps.registry, orchestrator: deps.orchestrator, config: deps.config, github: deps.github, repo: deps.repo }));
}
