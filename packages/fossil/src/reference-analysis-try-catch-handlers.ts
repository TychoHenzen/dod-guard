import type { TryCatchState } from "./reference-analysis-try-catch-state.js";

function isQuote(character: string | undefined): boolean {
  return character === '"' || character === "'" || character === "`";
}

export function consumeLineComment(
  content: string,
  index: number,
  state: TryCatchState,
): number | undefined {
  if (!state.lineComment) return undefined;
  if (content[index] === "\n") state.lineComment = false;
  return index;
}

export function consumeBlockComment(
  content: string,
  index: number,
  state: TryCatchState,
): number | undefined {
  if (!state.blockComment) return undefined;
  if (content[index] === "*" && content[index + 1] === "/") {
    state.blockComment = false;
    return index + 1;
  }
  return index;
}

export function startComment(
  content: string,
  index: number,
  state: TryCatchState,
): number | undefined {
  const character = content[index];
  const next = content[index + 1];
  if (character !== "/" || (next !== "/" && next !== "*")) return undefined;
  state.lineComment = next === "/";
  state.blockComment = next === "*";
  return index + 1;
}

export function startQuote(
  content: string,
  index: number,
  state: TryCatchState,
): number | undefined {
  const character = content[index];
  if (!isQuote(character)) return undefined;
  state.quote = character;
  return index;
}
