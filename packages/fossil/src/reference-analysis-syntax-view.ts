import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";

export function syntaxView(content: string): SyntaxView {
  const characters = content.split("");
  const comments: { start: number; end: number; text: string }[] = [];
  let quote = "";
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (quote) {
      characters[index] = " ";
      if (character === "\\") {
        characters[index + 1] = " ";
        index += 1;
      } else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      characters[index] = " ";
      continue;
    }
    if (character !== "/" || !(next === "/" || next === "*")) continue;
    const start = index;
    const lineComment = next === "/";
    index += 2;
    while (
      index < content.length &&
      (lineComment ? content[index] !== "\n" : !(content[index] === "*" && content[index + 1] === "/"))
    ) {
      index += 1;
    }
    const end = lineComment ? index : Math.min(content.length, index + 2);
    comments.push({ start, end, text: content.slice(start, end) });
    for (let offset = start; offset < end; offset += 1) {
      if (characters[offset] !== "\n") characters[offset] = " ";
    }
    index = end - 1;
  }
  return { code: characters.join(""), comments };
}
