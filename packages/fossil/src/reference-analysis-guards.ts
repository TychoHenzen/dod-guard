import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
import type { ReferenceRange } from "./reference-analysis-types/reference-range.js";
import { balancedClose, nextNonWhitespace } from "./reference-analysis-fallback-helpers.js";

function matchIndex(match: RegExpExecArray): number {
  return match.index ?? 0;
}

function recordCsharpDirective(
  match: RegExpExecArray,
  starts: number[],
  ranges: ReferenceRange[],
): void {
  if (match[1] !== "endif") {
    starts.push(matchIndex(match));
    return;
  }
  const start = starts.pop();
  if (start === undefined) return;
  ranges.push({ start, end: matchIndex(match) + match[0].length });
}

export function csharpGuardRanges(view: SyntaxView): readonly ReferenceRange[] {
  const ranges: ReferenceRange[] = [];
  const starts: number[] = [];
  const directives = /^\s*#(if|endif)\b.*$/gm;
  for (let match = directives.exec(view.code); match; match = directives.exec(view.code)) {
    recordCsharpDirective(match, starts, ranges);
  }
  return ranges;
}

function rustAttributeItem(
  view: SyntaxView,
  attributeStart: number,
): { itemStart: number; delimiter: number } | undefined {
  const conditionOpen = view.code.indexOf("(", attributeStart);
  const conditionClose = balancedClose({ code: view.code, open: conditionOpen, opening: "(", closing: ")" });
  if (conditionClose === undefined) return undefined;
  const attributeEnd = nextNonWhitespace(view.code, conditionClose + 1);
  if (view.code[attributeEnd] !== "]") return undefined;
  const itemStart = nextNonWhitespace(view.code, attributeEnd + 1);
  let delimiter = itemStart;
  while (delimiter < view.code.length && view.code[delimiter] !== "{" && view.code[delimiter] !== ";") delimiter += 1;
  return { itemStart, delimiter };
}

function rustGuardRange(view: SyntaxView, match: RegExpExecArray): ReferenceRange | undefined {
  const item = rustAttributeItem(view, matchIndex(match));
  if (!item) return undefined;
  const itemEnd = rustBlockEnd(view, item);
  if (itemEnd !== undefined) return { start: item.itemStart, end: itemEnd };
  if (view.code[item.delimiter] === ";") return { start: item.itemStart, end: item.delimiter };
  return undefined;
}

function rustBlockEnd(view: SyntaxView, item: { itemStart: number; delimiter: number }): number | undefined {
  if (view.code[item.delimiter] !== "{") return undefined;
  return balancedClose({ code: view.code, open: item.delimiter, opening: "{", closing: "}" });
}

export function rustGuardRanges(view: SyntaxView): readonly ReferenceRange[] {
  const ranges: ReferenceRange[] = [];
  const attributes = /#\s*\[\s*cfg\s*\(/g;
  for (let match = attributes.exec(view.code); match; match = attributes.exec(view.code)) {
    const range = rustGuardRange(view, match);
    if (range) ranges.push(range);
  }
  return ranges;
}
