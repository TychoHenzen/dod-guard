import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
import { balancedClose, nextNonWhitespace } from "./reference-analysis-fallback-helpers.js";

function matchIndex(match: RegExpExecArray): number {
  return match.index ?? 0;
}

function recordCsharpDirective(
  match: RegExpExecArray,
  starts: number[],
  ranges: [number, number][],
): void {
  if (match[1] !== "endif") {
    starts.push(matchIndex(match));
    return;
  }
  const start = starts.pop();
  if (start === undefined) return;
  ranges.push([start, matchIndex(match) + match[0].length]);
}

export function csharpGuardRanges(view: SyntaxView): readonly [number, number][] {
  const ranges: [number, number][] = [];
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
  const conditionClose = balancedClose(view.code, conditionOpen, "(", ")");
  if (conditionClose === undefined) return undefined;
  const attributeEnd = nextNonWhitespace(view.code, conditionClose + 1);
  if (view.code[attributeEnd] !== "]") return undefined;
  const itemStart = nextNonWhitespace(view.code, attributeEnd + 1);
  let delimiter = itemStart;
  while (delimiter < view.code.length && view.code[delimiter] !== "{" && view.code[delimiter] !== ";") delimiter += 1;
  return { itemStart, delimiter };
}

function rustGuardRange(view: SyntaxView, match: RegExpExecArray): [number, number] | undefined {
  const item = rustAttributeItem(view, matchIndex(match));
  if (!item) return undefined;
  const itemEnd = rustBlockEnd(view, item);
  if (itemEnd !== undefined) return [item.itemStart, itemEnd];
  if (view.code[item.delimiter] === ";") return [item.itemStart, item.delimiter];
  return undefined;
}

function rustBlockEnd(view: SyntaxView, item: { itemStart: number; delimiter: number }): number | undefined {
  if (view.code[item.delimiter] !== "{") return undefined;
  return balancedClose(view.code, item.delimiter, "{", "}");
}

export function rustGuardRanges(view: SyntaxView): readonly [number, number][] {
  const ranges: [number, number][] = [];
  const attributes = /#\s*\[\s*cfg\s*\(/g;
  for (let match = attributes.exec(view.code); match; match = attributes.exec(view.code)) {
    const range = rustGuardRange(view, match);
    if (range) ranges.push(range);
  }
  return ranges;
}
