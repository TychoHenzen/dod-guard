import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
import type {
  ReferenceRange,
} from "./reference-analysis-types/reference-range.js";
import { conditionalRange } from "./reference-analysis-conditional-helpers.js";

function conditionalRanges(
  view: SyntaxView,
  matchIndex: number,
): ReferenceRange[] {
  return conditionalRange(view, matchIndex);
}

export function conditionalFallbackRanges(
  view: SyntaxView,
): readonly ReferenceRange[] {
  const ranges: ReferenceRange[] = [];
  const matcher = /\bif\b/g;
  for (
    let match = matcher.exec(view.code);
    match;
    match = matcher.exec(view.code)
  ) {
    ranges.push(...conditionalRanges(view, match.index ?? 0));
  }
  return ranges;
}
