import type { TryCatchState } from "./reference-analysis-try-catch-state.js";

function isTryCatchBlock(state: TryCatchState): boolean {
  if (state.pendingBody === "try") return true;
  return state.pendingBody === "catch" && state.catchParameterDepth === 0;
}

function consumeBrace(
  content: string,
  index: number,
  state: TryCatchState,
): number | undefined {
  if (content[index] === "{") {
    const kind = isTryCatchBlock(state);
    state.stack.push({ kind, start: index });
    if (kind) state.pendingBody = undefined;
    return index;
  }
  if (content[index] !== "}") return undefined;
  const opened = state.stack.pop();
  if (opened?.kind) state.ranges.push({ start: opened.start, end: index });
  return index;
}

export function consumeTryCatchStructuralCharacter(
  content: string,
  index: number,
  state: TryCatchState,
): number {
  return consumeBrace(content, index, state) ?? index;
}
