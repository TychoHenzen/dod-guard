import {
  consumeTryCatchLexicalCharacter,
} from "./reference-analysis-try-catch-lexical.js";
import {
  consumeTryCatchStructuralCharacter,
} from "./reference-analysis-try-catch-structure.js";
import type { TryCatchState } from "./reference-analysis-try-catch-state.js";
import type {
  ReferenceRange,
} from "./reference-analysis-types/reference-range.js";

function consumeCharacter(
  content: string,
  index: number,
  state: TryCatchState,
): number {
  const lexicalIndex = consumeTryCatchLexicalCharacter(content, index, state);
  if (lexicalIndex !== undefined) return lexicalIndex;
  return consumeTryCatchStructuralCharacter(content, index, state);
}

export function tryCatchRanges(content: string): readonly ReferenceRange[] {
  const state: TryCatchState = {
    ranges: [],
    stack: [],
    pendingBody: undefined,
    catchParameterDepth: 0,
    quote: "",
    lineComment: false,
    blockComment: false,
  };
  for (let index = 0; index < content.length; index += 1)
    index = consumeCharacter(content, index, state);
  return state.ranges;
}
