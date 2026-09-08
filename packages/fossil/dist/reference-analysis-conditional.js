import { conditionalRange } from "./reference-analysis-conditional-helpers.js";
function conditionalRanges(view, matchIndex) {
    return conditionalRange(view, matchIndex);
}
export function conditionalFallbackRanges(view) {
    const ranges = [];
    const matcher = /\bif\b/g;
    for (let match = matcher.exec(view.code); match; match = matcher.exec(view.code)) {
        ranges.push(...conditionalRanges(view, match.index ?? 0));
    }
    return ranges;
}
//# sourceMappingURL=reference-analysis-conditional.js.map