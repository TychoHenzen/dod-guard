import type { BrowserOperation, BrowserShellState } from "./types.js";

export type BrowserAction = {
  operation: BrowserOperation | string;
  symbol?: { name: string; path: string; kind: string };
  drawer?: "discovery" | "relations" | undefined;
};

export type {
  BrowserOperation,
  BrowserShellState,
  LandmarkGroup,
} from "./types.js";
export {
  renderBrowserBody,
  renderBrowserShell,
} from "./browser-shell-render.js";

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

function defaultValue<T>(value: T | undefined, fallback: T): T {
  if (value !== undefined) return value;
  return fallback;
}

function initialState(initial: Partial<BrowserShellState>): BrowserShellState {
  return {
    landmarks: defaultValue(initial.landmarks, []),
    focus: initial.focus,
    activeDrawer: initial.activeDrawer,
    status: defaultValue(initial.status, "Project ready"),
    navigationEnabled: defaultValue(initial.navigationEnabled, true),
  };
}

function applyAction(
  state: BrowserShellState,
  action: BrowserAction,
): BrowserShellState {
  if (!visibleOperations.includes(action.operation as BrowserOperation))
    throw new Error("unsupported_browser_operation");
  if (action.operation === "focus" && action.symbol)
    return { ...state, focus: action.symbol };
  if (action.operation === "set_drawer")
    return { ...state, activeDrawer: action.drawer };
  return state;
}

/** Holds local shell state. Navigation effects remain restricted to the shared
 * core.
 */
export function createBrowserStore(initial: Partial<BrowserShellState> = {}) {
  let state = initialState(initial);
  return {
    state: (): BrowserShellState => state,
    visibleOperations: (): readonly BrowserOperation[] => visibleOperations,
    dispatch: (action: BrowserAction): void => {
      state = applyAction(state, action);
    },
  };
}
