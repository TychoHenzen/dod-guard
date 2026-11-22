// Names the function a finding sits in, so the pull-request gate can tell
// two findings of one rule apart when their messages carry no subject.

import { lineAt } from "./offsets.mjs";

// A file-level finding sits on line 1 whatever the file holds.
const FILE_LEVEL = new Set(["file-length"]);

function spanOf(starts) {
  return (fn) => ({ name: fn.name, from: fn.line, to: lineAt(starts, fn.end) });
}

const contains = (line) => (span) => span.from <= line && line <= span.to;

const narrower = (left, right) =>
  left.to - left.from <= right.to - right.from ? left : right;

function innermost(spans, line) {
  const around = spans.filter(contains(line));
  return around.length === 0 ? undefined : around.reduce(narrower);
}

function symbolFor(violation, spans) {
  if (FILE_LEVEL.has(violation.rule)) return undefined;
  return innermost(spans, violation.line)?.name;
}

/**
 * Adds `symbol`, the name of the innermost function around the finding, to
 * each violation inside one. Violations outside every function stay as is.
 * Returns the same array.
 */
export function stampSymbols(violations, functions, starts) {
  const spans = functions.map(spanOf(starts));
  for (const violation of violations) {
    const name = symbolFor(violation, spans);
    if (name !== undefined) violation.symbol = name;
  }
  return violations;
}
