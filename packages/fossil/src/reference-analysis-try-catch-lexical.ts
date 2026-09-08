import type { TryCatchState } from "./reference-analysis-try-catch-state.js";
import {
  consumeBlockComment,
  consumeLineComment,
  startComment,
  startQuote,
} from "./reference-analysis-try-catch-handlers.js";

function consumeQuote(
  content: string,
  index: number,
  state: TryCatchState,
): number | undefined {
  if (!state.quote) return undefined;
  if (content[index] === "\\") return index + 1;
  if (content[index] === state.quote) state.quote = "";
  return index;
}

function wordEnd(content: string, index: number): number {
  let end = index + 1;
  while (/[\w$]/.test(content[end] ?? "")) end += 1;
  return end;
}

function tryCatchWord(word: string): "try" | "catch" | undefined {
  if (word === "try") return "try";
  if (word === "catch") return "catch";
  return undefined;
}

function consumeWord(
  content: string,
  index: number,
  state: TryCatchState,
): number | undefined {
  if (!/[A-Za-z_$]/.test(content[index] ?? "")) return undefined;
  const end = wordEnd(content, index);
  const word = content.slice(index, end);
  const tryCatch = tryCatchWord(word);
  if (tryCatch) {
    state.pendingBody = tryCatch;
    state.catchParameterDepth = 0;
  }
  return end - 1;
}

function consumeCatchParameter(
  content: string,
  index: number,
  state: TryCatchState,
): number | undefined {
  if (state.pendingBody !== "catch") return undefined;
  if (content[index] === "(") {
    state.catchParameterDepth += 1;
    return index;
  }
  if (content[index] === ")" && state.catchParameterDepth > 0) {
    state.catchParameterDepth -= 1;
    return index;
  }
  return undefined;
}

const TRY_CATCH_LEXICAL_HANDLERS: readonly ((
  content: string,
  index: number,
  state: TryCatchState,
) => number | undefined)[] = [
  consumeLineComment,
  consumeBlockComment,
  consumeQuote,
  startComment,
  startQuote,
  consumeWord,
  consumeCatchParameter,
];

export function consumeTryCatchLexicalCharacter(
  content: string,
  index: number,
  state: TryCatchState,
): number | undefined {
  for (const handler of TRY_CATCH_LEXICAL_HANDLERS) {
    const next = handler(content, index, state);
    if (next !== undefined) return next;
  }
  return undefined;
}
