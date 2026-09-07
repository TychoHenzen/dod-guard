import type { BrowserFocus } from "./browser-focus.js";
import type { FocusNavigationState } from "./focus-navigation-state.js";
import type { FocusReply } from "./focus-reply.js";

export function commitFocus(
  current: FocusNavigationState,
  focus: BrowserFocus,
): FocusNavigationState {
  const history = [
    ...current.history.slice(0, current.historyPosition + 1),
    focus,
  ];
  return {
    focus,
    history,
    historyPosition: history.length - 1,
    error: undefined,
  };
}

export function commitFocusReply(
  current: FocusNavigationState,
  reply: FocusReply,
): { state: FocusNavigationState; accepted: boolean } {
  if (reply.state !== "ok" || !reply.data)
    return { state: { ...current, error: reply.state }, accepted: false };
  return { state: commitFocus(current, reply.data), accepted: true };
}
