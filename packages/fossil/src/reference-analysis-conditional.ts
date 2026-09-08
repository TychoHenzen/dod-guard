import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
import type { ReferenceRange } from "./reference-analysis-types/reference-range.js";
import { balancedClose, hasFallbackToken, hasLeadingFallbackComment, nextNonWhitespace } from "./reference-analysis-fallback-helpers.js";

function conditionalBody(view: SyntaxView, matchIndex: number) {
  const conditionOpen = nextNonWhitespace(view.code, matchIndex);
  if (view.code[conditionOpen] !== "(") return undefined;
  const conditionClose = balancedClose({ code: view.code, open: conditionOpen, opening: "(", closing: ")" });
  if (conditionClose === undefined) return undefined;
  const bodyOpen = nextNonWhitespace(view.code, conditionClose + 1);
  if (view.code[bodyOpen] !== "{") return undefined;
  const bodyClose = balancedClose({ code: view.code, open: bodyOpen, opening: "{", closing: "}" });
  if (bodyClose === undefined) return undefined;
  return { conditionOpen, conditionClose, bodyOpen, bodyClose };
}

function hasConditionalFallback({ view, matchIndex, conditionOpen, conditionClose }: {
  view: SyntaxView;
  matchIndex: number;
  conditionOpen: number;
  conditionClose: number;
}): boolean {
  if (hasFallbackToken(view.code.slice(conditionOpen + 1, conditionClose))) return true;
  return hasLeadingFallbackComment(view, matchIndex);
}

function hasFallbackElse(view: SyntaxView, fallbackIf: boolean, elseStart: number): boolean {
  if (fallbackIf) return true;
  return hasLeadingFallbackComment(view, elseStart);
}

function elseBody(view: SyntaxView, bodyClose: number, fallbackIf: boolean): ReferenceRange | undefined {
  const elseStart = nextNonWhitespace(view.code, bodyClose + 1);
  if (view.code.slice(elseStart, elseStart + 4) !== "else") return undefined;
  const elseBodyOpen = nextNonWhitespace(view.code, elseStart + 4);
  if (view.code[elseBodyOpen] !== "{") return undefined;
  const elseBodyClose = balancedClose({ code: view.code, open: elseBodyOpen, opening: "{", closing: "}" });
  if (elseBodyClose === undefined) return undefined;
  if (!hasFallbackElse(view, fallbackIf, elseStart)) return undefined;
  return { start: elseBodyOpen, end: elseBodyClose };
}

function conditionalRanges(view: SyntaxView, matchIndex: number): ReferenceRange[] {
  const body = conditionalBody(view, matchIndex + 2);
  if (!body) return [];
  const fallbackIf = hasConditionalFallback({
    view,
    matchIndex,
    conditionOpen: body.conditionOpen,
    conditionClose: body.conditionClose,
  });
  const ranges: ReferenceRange[] = [];
  if (fallbackIf) ranges.push({ start: body.bodyOpen, end: body.bodyClose });
  const fallbackElse = elseBody(view, body.bodyClose, fallbackIf);
  if (fallbackElse) ranges.push(fallbackElse);
  return ranges;
}

export function conditionalFallbackRanges(view: SyntaxView): readonly ReferenceRange[] {
  const ranges: ReferenceRange[] = [];
  const matcher = /\bif\b/g;
  for (let match = matcher.exec(view.code); match; match = matcher.exec(view.code)) {
    ranges.push(...conditionalRanges(view, match.index ?? 0));
  }
  return ranges;
}
