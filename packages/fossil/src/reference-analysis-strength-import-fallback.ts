import type {
  ReferenceRange,
  ReferenceSourceContent,
} from "./reference-analysis-types.js";
import { conditionalFallbackRanges } from "./reference-analysis-conditional.js";
import * as fallbackOperands from "./reference-analysis-fallback-operands.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";
import { tryCatchRanges } from "./reference-analysis-try-catch.js";

export function fallbackRegions(
  source: ReferenceSourceContent,
  view: ReturnType<typeof syntaxView>,
): ReferenceRange[] {
  return [
    ...tryCatchRanges(source.content),
    ...conditionalFallbackRanges(view),
    ...fallbackOperands.fallbackOperandRanges(view.code),
  ];
}

export function isInsideFallback(
  index: number,
  regions: readonly ReferenceRange[],
): boolean {
  return regions.some((range) => index > range.start && index < range.end);
}
