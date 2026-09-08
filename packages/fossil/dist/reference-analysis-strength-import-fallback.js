import { conditionalFallbackRanges } from "./reference-analysis-conditional.js";
import * as fallbackOperands from "./reference-analysis-fallback-operands.js";
import { tryCatchRanges } from "./reference-analysis-try-catch.js";
export function fallbackRegions(source, view) {
    return [
        ...tryCatchRanges(source.content),
        ...conditionalFallbackRanges(view),
        ...fallbackOperands.fallbackOperandRanges(view.code),
    ];
}
export function isInsideFallback(index, regions) {
    return regions.some((range) => index > range.start && index < range.end);
}
//# sourceMappingURL=reference-analysis-strength-import-fallback.js.map