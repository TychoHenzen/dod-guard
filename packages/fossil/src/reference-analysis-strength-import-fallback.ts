import type {
  ReferenceRange,
} from "./reference-analysis-types/reference-range.js";
import type {
  ReferenceSourceContent,
} from "./reference-analysis-types/reference-source-content.js";
import { conditionalFallbackRanges } from "./reference-analysis-conditional.js";
import {
  fallbackOperandRanges,
} from "./reference-analysis-fallback-operands.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";
import { tryCatchRanges } from "./reference-analysis-try-catch.js";

export function fallbackRegions(
  source: ReferenceSourceContent,
  view: ReturnType<typeof syntaxView>,
): ReferenceRange[] {
  return [
    ...tryCatchRanges(source.content),
    ...conditionalFallbackRanges(view),
    ...fallbackOperandRanges(view.code),
  ];
}

export function isInsideFallback(
  index: number,
  regions: readonly ReferenceRange[],
): boolean {
  return regions.some((range) => index > range.start && index < range.end);
}
