import type { TryCatchState } from "./reference-analysis-try-catch-state.js";

function isQuote(character: string | undefined): boolean {
  return character === '"' || character === "'" || character === "`";
}

function consumeLineComment(content: string, index: number, state: TryCatchState): number | undefined {
  if (!state.lineComment) return undefined;
  if (content[index] === "\n") state.lineComment = false;
  return index;
}

function consumeBlockComment(content: string, index: number, state: TryCatchState): number | undefined {
  if (!state.blockComment) return undefined;
  if (content[index] === "*" && content[index + 1] === "/") {
    state.blockComment = false;
    return index + 1;
  }
  return index;
}

function consumeQuote(content: string, index: number, state: TryCatchState): number | undefined {
  if (!state.quote) return undefined;
  if (content[index] === "\\") return index + 1;
  if (content[index] === state.quote) state.quote = "";
  return index;
}

function startComment(content: string, index: number, state: TryCatchState): number | undefined {
  const character = content[index];
  const next = content[index + 1];
  if (character !== "/" || (next !== "/" && next !== "*")) return undefined;
  state.lineComment = next === "/";
  state.blockComment = next === "*";
  return index + 1;
}

function startQuote(content: string, index: number, state: TryCatchState): number | undefined {
  const character = content[index];
  if (!isQuote(character)) return undefined;
  state.quote = character;
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

function consumeWord(content: string, index: number, state: TryCatchState): number | undefined {
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

function consumeCatchParameter(content: string, index: number, state: TryCatchState): number | undefined {
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

const TRY_CATCH_LEXICAL_HANDLERS: readonly ((content: string, index: number, state: TryCatchState) => number | undefined)[] = [
  consumeLineComment,
  consumeBlockComment,
  consumeQuote,
  startComment,
  startQuote,
  consumeWord,
  consumeCatchParameter,
];

export function consumeTryCatchLexicalCharacter(content: string, index: number, state: TryCatchState): number | undefined {
  for (const handler of TRY_CATCH_LEXICAL_HANDLERS) {
    const next = handler(content, index, state);
    if (next !== undefined) return next;
  }
  return undefined;
}
