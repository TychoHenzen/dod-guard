export { rustGuardRanges } from "./reference-analysis-rust-guards.js";
function matchIndex(match) {
    return match.index ?? 0;
}
function recordCsharpDirective(match, starts, ranges) {
    if (match[1] !== "endif") {
        starts.push(matchIndex(match));
        return;
    }
    const start = starts.pop();
    if (start === undefined)
        return;
    ranges.push({ start, end: matchIndex(match) + match[0].length });
}
export function csharpGuardRanges(view) {
    const ranges = [];
    const starts = [];
    const directives = /^\s*#(if|endif)\b.*$/gm;
    for (let match = directives.exec(view.code); match; match = directives.exec(view.code)) {
        recordCsharpDirective(match, starts, ranges);
    }
    return ranges;
}
//# sourceMappingURL=reference-analysis-guards.js.map