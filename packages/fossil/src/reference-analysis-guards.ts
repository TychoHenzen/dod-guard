import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
import { balancedClose, nextNonWhitespace } from "./reference-analysis-fallback-helpers.js";

export function csharpGuardRanges(view: SyntaxView): readonly [number, number][] {
  const ranges: [number, number][] = [];
  const starts: number[] = [];
  const directives = /^\s*#(if|endif)\b.*$/gm;
  for (let match = directives.exec(view.code); match; match = directives.exec(view.code)) {
    if (match[1] === "if") starts.push(match.index ?? 0);
    else {
      const start = starts.pop();
      if (start !== undefined) ranges.push([start, (match.index ?? 0) + match[0].length]);
    }
  }
  return ranges;
}

export function rustGuardRanges(view: SyntaxView): readonly [number, number][] {
  const ranges: [number, number][] = [];
  const attributes = /#\s*\[\s*cfg\s*\(/g;
  for (let match = attributes.exec(view.code); match; match = attributes.exec(view.code)) {
    const attributeStart = match.index ?? 0;
    const conditionOpen = view.code.indexOf("(", attributeStart);
    const conditionClose = balancedClose(view.code, conditionOpen, "(", ")");
    if (conditionClose === undefined) continue;
    const attributeEnd = nextNonWhitespace(view.code, conditionClose + 1);
    if (view.code[attributeEnd] !== "]") continue;
    const itemStart = nextNonWhitespace(view.code, attributeEnd + 1);
    let delimiter = itemStart;
    while (delimiter < view.code.length && view.code[delimiter] !== "{" && view.code[delimiter] !== ";") delimiter += 1;
    if (view.code[delimiter] === "{") {
      const itemEnd = balancedClose(view.code, delimiter, "{", "}");
      if (itemEnd !== undefined) ranges.push([itemStart, itemEnd]);
    } else if (view.code[delimiter] === ";") ranges.push([itemStart, delimiter]);
  }
  return ranges;
}
