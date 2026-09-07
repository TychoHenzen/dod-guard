import type { FixtureBehavior } from "./behavior-state.test.js";

function errorReply(code: string) {
  return { schema_version: 1, code, message: code, retryable: true };
}

function refreshFailure(state: FixtureBehavior, action: unknown) {
  if (!state.failRefresh || action !== "refresh") return;
  state.failRefresh = false;
  return errorReply("refresh_failed");
}

function focusFailure(state: FixtureBehavior) {
  if (!state.failFocus) return;
  state.failFocus = false;
  return errorReply("focus_failed");
}

export function forcedFailure(
  state: FixtureBehavior,
  name: string,
  args: Record<string, unknown>,
) {
  if (name === "code_status") return refreshFailure(state, args.action);
  if (name === "code_focus") return focusFailure(state);
}
