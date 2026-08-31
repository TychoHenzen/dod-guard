export type LandmarkGroup = { group: string; items: readonly string[] };
export type FocusedSymbol = { name: string; path: string; kind: string };
export type BrowserAction = {
  operation: BrowserOperation | string;
  symbol?: FocusedSymbol;
  drawer?: "discovery" | "relations" | undefined;
};

export type BrowserOperation =
  | "search"
  | "focus"
  | "back"
  | "forward"
  | "refocus"
  | "refresh"
  | "status"
  | "set_filters"
  | "set_drawer";

export type BrowserShellState = {
  landmarks: readonly LandmarkGroup[];
  focus?: FocusedSymbol;
  activeDrawer?: "discovery" | "relations";
  status: string;
};

const visibleOperations: readonly BrowserOperation[] = [
  "search",
  "focus",
  "back",
  "forward",
  "refocus",
  "refresh",
  "status",
  "set_filters",
  "set_drawer",
];

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Holds local shell state. Navigation effects remain restricted to the shared read-only core. */
export function createBrowserStore(initial: Partial<BrowserShellState> = {}) {
  let state: BrowserShellState = {
    landmarks: initial.landmarks ?? [],
    focus: initial.focus,
    activeDrawer: initial.activeDrawer,
    status: initial.status ?? "Project ready",
  };

  return {
    state: (): BrowserShellState => state,
    visibleOperations: (): readonly BrowserOperation[] => visibleOperations,
    dispatch: (action: BrowserAction): void => {
      if (!visibleOperations.includes(action.operation as BrowserOperation))
        throw new Error("unsupported_browser_operation");
      if (action.operation === "focus" && action.symbol) state = { ...state, focus: action.symbol };
      if (action.operation === "set_drawer") state = { ...state, activeDrawer: action.drawer };
    },
  };
}

function renderLandmarks(landmarks: readonly LandmarkGroup[]): string {
  if (landmarks.length === 0) return '<p data-state="empty">No landmarks available</p>';
  return landmarks
    .map(
      ({ group, items }) =>
        `<section class="landmark-group"><h3>${escapeText(group)}</h3><ul>${items.map((item) => `<li>${escapeText(item)}</li>`).join("")}</ul></section>`,
    )
    .join("");
}

function drawerButton(name: "discovery" | "relations", open: boolean): string {
  const label = name === "discovery" ? "Discovery" : "Relations";
  return `<button type="button" data-drawer="${name}" aria-controls="${name}-pane" aria-expanded="${open}">${label}</button>`;
}

/** Produces the application shell from text-only state, with no untrusted markup interpolation. */
export function renderBrowserShell(state: BrowserShellState, viewportWidth: number): string {
  const narrow = viewportWidth < 900;
  const discoveryDrawer = narrow ? drawerButton("discovery", state.activeDrawer === "discovery") : "";
  const relationDrawer = narrow ? drawerButton("relations", state.activeDrawer === "relations") : "";
  const focus = state.focus
    ? `<article class="focused-symbol"><h2>${escapeText(state.focus.name)}</h2><p>${escapeText(state.focus.kind)} · ${escapeText(state.focus.path)}</p></article>`
    : '<p data-state="empty-focus">Select a symbol</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Code Explorer</title></head><body><header class="status-strip"><span>${escapeText(state.status)}</span><nav aria-label="Navigation"><button type="button" data-operation="back">Back</button><button type="button" data-operation="forward">Forward</button><button type="button" data-operation="refocus">Refocus</button><button type="button" data-operation="refresh">Refresh</button></nav></header><main class="explorer-shell ${narrow ? "narrow" : "desktop"}">${discoveryDrawer}<aside id="discovery-pane" data-pane="discovery"><h2>Landmarks</h2><label>Search <input type="search" data-operation="search"></label>${renderLandmarks(state.landmarks)}</aside><section data-pane="focus"><h1>Focused source</h1>${focus}</section><aside id="relations-pane" data-pane="relations"><h2>Relations</h2><p data-state="empty-relations">No relations loaded</p></aside>${relationDrawer}</main></body></html>`;
}
