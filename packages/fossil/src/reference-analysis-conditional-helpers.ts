import type {
  ReferenceRange,
} from "./reference-analysis-types/reference-range.js";
import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
import {
  balancedClose,
  hasFallbackToken,
  hasLeadingFallbackComment,
  nextNonWhitespace,
} from "./reference-analysis-fallback-helpers.js";

function conditionalBody(view: SyntaxView, matchIndex: number) {
  const conditionOpen = nextNonWhitespace(view.code, matchIndex);
  if (view.code[conditionOpen] !== "(") return undefined;
  const conditionClose = balancedClose({
    code: view.code,
    open: conditionOpen,
    opening: "(",
    closing: ")",
  });
  if (conditionClose === undefined) return undefined;
  const bodyOpen = nextNonWhitespace(view.code, conditionClose + 1);
  if (view.code[bodyOpen] !== "{") return undefined;
  const bodyClose = balancedClose({
    code: view.code,
    open: bodyOpen,
    opening: "{",
    closing: "}",
  });
  if (bodyClose === undefined) return undefined;
  return { conditionOpen, conditionClose, bodyOpen, bodyClose };
}

function hasConditionalFallback(input: {
  view: SyntaxView;
  matchIndex: number;
  conditionOpen: number;
  conditionClose: number;
}): boolean {
  if (
    hasFallbackToken(
      input.view.code.slice(input.conditionOpen + 1, input.conditionClose),
    )
  )
    return true;
  return hasLeadingFallbackComment(input.view, input.matchIndex);
}

function hasFallbackElse(
  view: SyntaxView,
  fallbackIf: boolean,
  elseStart: number,
): boolean {
  if (fallbackIf) return true;
  return hasLeadingFallbackComment(view, elseStart);
}

function elseBody(
  view: SyntaxView,
  bodyClose: number,
  fallbackIf: boolean,
): ReferenceRange | undefined {
  const elseStart = nextNonWhitespace(view.code, bodyClose + 1);
  if (view.code.slice(elseStart, elseStart + 4) !== "else") return undefined;
  const elseBodyOpen = nextNonWhitespace(view.code, elseStart + 4);
  if (view.code[elseBodyOpen] !== "{") return undefined;
  const elseBodyClose = balancedClose({
    code: view.code,
    open: elseBodyOpen,
    opening: "{",
    closing: "}",
  });
  if (elseBodyClose === undefined) return undefined;
  if (!hasFallbackElse(view, fallbackIf, elseStart)) return undefined;
  return { start: elseBodyOpen, end: elseBodyClose };
}

function conditionalRange(
  view: SyntaxView,
  matchIndex: number,
): ReferenceRange[] {
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

export { conditionalRange };
