import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
import {
  consumeCommentStart,
  consumeQuote,
  consumeQuoteStart,
  type SyntaxState,
} from "./reference-analysis-syntax-handlers.js";

const SYNTAX_HANDLERS: readonly ((
  content: string,
  index: number,
  state: SyntaxState,
) => number | undefined)[] = [
  consumeQuote,
  consumeCommentStart,
  consumeQuoteStart,
];

function consumeSyntaxCharacter(
  content: string,
  index: number,
  state: SyntaxState,
): number {
  for (const handler of SYNTAX_HANDLERS) {
    const nextIndex = handler(content, index, state);
    if (nextIndex !== undefined) return nextIndex;
  }
  return index;
}

export function syntaxView(content: string): SyntaxView {
  const state: SyntaxState = {
    characters: content.split(""),
    comments: [],
    quote: "",
  };
  for (let index = 0; index < content.length; index += 1)
    index = consumeSyntaxCharacter(content, index, state);
  return { code: state.characters.join(""), comments: state.comments };
}
