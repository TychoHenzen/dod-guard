import type { BrowserFocus } from "./browser-focus.js";
import type { FocusNavigationState } from "./focus-navigation-state.js";

export function moveHistory(
  current: FocusNavigationState,
  direction: "back" | "forward",
  onStart: () => void,
): FocusNavigationState | undefined {
  if (!historyAvailable(current, direction)) return undefined;
  onStart();
  const historyPosition =
    current.historyPosition + (direction === "back" ? -1 : 1);
  const focus: BrowserFocus | undefined = current.history[historyPosition];
  if (!focus) return undefined;
  return { ...current, focus, historyPosition, error: undefined };
}

function historyAvailable(
  current: FocusNavigationState,
  direction: "back" | "forward",
): boolean {
  if (direction === "back") return current.historyPosition > 0;
  return current.historyPosition < current.history.length - 1;
}
