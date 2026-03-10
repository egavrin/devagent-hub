import React from "react";
import { render } from "ink";
import type { CanonicalStore } from "../persistence/canonical-store.js";
import { HubApp, type HubScreen } from "./app.js";

export function renderTui(store: CanonicalStore, screen: HubScreen, workflowId?: string) {
  return render(<HubApp store={store} screen={screen} workflowId={workflowId} />);
}
