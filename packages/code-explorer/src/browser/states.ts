export type BrowserAreaState = "not_loaded" | "loading" | "empty" | "unavailable" | "stale" | "failed" | "ready";
export type BrowserArea = "search" | "relations" | "graph" | "freshness" | "workspace";

export type BrowserWorkspaceState = {
  generation: number;
  workspace_state: string;
  readiness: string;
  navigationEnabled: boolean;
  cause?: string;
};

/** Renders each local area independently so one failed request does not erase adjacent browser context. */
export function renderBrowserArea(area: BrowserArea, state: BrowserAreaState, detail?: string): string {
  const text = detail ?? state;
  return `<section data-area="${area}" data-state="${state}">${text}</section>`;
}

/** Keeps generation-zero workspace failures visible while closing navigation actions. */
export class BrowserWorkspaceController {
  private current: BrowserWorkspaceState = {
    generation: 0,
    workspace_state: "workspace_unavailable",
    readiness: "unavailable",
    navigationEnabled: false,
  };

  state(): BrowserWorkspaceState {
    return { ...this.current };
  }

  update(status: {
    generation: number;
    workspace_state: string;
    readiness: string;
    cause?: string;
  }): BrowserWorkspaceState {
    this.current = {
      ...status,
      navigationEnabled: status.generation > 0 && status.workspace_state !== "workspace_unavailable",
    };
    return this.state();
  }
}
