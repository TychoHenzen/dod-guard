import type { SyntaxView } from "./reference-analysis-types/syntax-view.js";
import type {
  ReferenceRange,
} from "./reference-analysis-types/reference-range.js";
export { rustGuardRanges } from "./reference-analysis-rust-guards.js";

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
  for (
    let match = directives.exec(view.code);
    match;
    match = directives.exec(view.code)
  ) {
    recordCsharpDirective(match, starts, ranges);
  }
  return ranges;
}
