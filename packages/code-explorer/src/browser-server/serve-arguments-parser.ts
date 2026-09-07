import { BrowserServerError } from "./browser-server-error.js";
import type { ServeArguments } from "./serve-arguments.js";

type ParseState = { projectRoot: string; noOpen: boolean };

function parseNoOpen(state: ParseState): ParseState | undefined {
  if (state.noOpen) return undefined;
  return { ...state, noOpen: true };
}

function parseProjectRoot(
  value: string | undefined,
  state: ParseState,
): ParseState | undefined {
  if (!value || state.projectRoot !== ".") return undefined;
  return { ...state, projectRoot: value };
}

function parseArgument(
  argument: string | undefined,
  value: string | undefined,
  state: ParseState,
): { state: ParseState; consumed: number } {
  if (argument === "--no-open") {
    const next = parseNoOpen(state);
    if (!next) throw new BrowserServerError("invalid_request");
    return { state: next, consumed: 0 };
  }
  if (argument === "--project-root") {
    const next = parseProjectRoot(value, state);
    if (!next) throw new BrowserServerError("invalid_request");
    return { state: next, consumed: 1 };
  }
  throw new BrowserServerError("invalid_request");
}

export function parseServeArguments(
  arguments_: readonly string[],
): ServeArguments {
  if (arguments_[0] !== "serve")
    throw new BrowserServerError("invalid_request");
  let state: ParseState = { projectRoot: ".", noOpen: false };
  for (let index = 1; index < arguments_.length; index += 1) {
    const parsed = parseArgument(
      arguments_[index],
      arguments_[index + 1],
      state,
    );
    state = parsed.state;
    index += parsed.consumed;
  }
  return { project_root: state.projectRoot, no_open: state.noOpen };
}
