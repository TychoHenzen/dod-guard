import type { BrowserFocus } from "./browser-focus.js";

export type FocusNavigationState = {
  focus?: BrowserFocus;
  history: readonly BrowserFocus[];
  historyPosition: number;
  error?: string;
};

export function createFocusNavigationState(
  initial: BrowserFocus | undefined,
): FocusNavigationState {
  if (initial)
    return { focus: initial, history: [initial], historyPosition: 0 };
  return { history: [], historyPosition: -1 };
}
