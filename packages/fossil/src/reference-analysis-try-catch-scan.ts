import * as lexical from "./reference-analysis-try-catch-lexical.js";
import * as structural from "./reference-analysis-try-catch-structure.js";
import type { TryCatchState } from "./reference-analysis-try-catch-state.js";
import type { ReferenceRange } from "./reference-analysis-types.js";

function consumeCharacter(
  content: string,
  index: number,
  state: TryCatchState,
): number {
  const lexicalIndex = lexical.consumeTryCatchLexicalCharacter(
    content,
    index,
    state,
  );
  if (lexicalIndex !== undefined) return lexicalIndex;
  return structural.consumeTryCatchStructuralCharacter(content, index, state);
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
