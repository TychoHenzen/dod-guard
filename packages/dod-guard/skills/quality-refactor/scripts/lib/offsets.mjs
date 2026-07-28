// Offset primitives shared by the parsers: line lookup and bracket matching.

/** Index of every line start, for O(log n) offset -> line lookups. */
export function lineIndex(code) {
  const starts = [0];
  for (let i = 0; i < code.length; i += 1) {
    if (code[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

export function lineAt(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Offset of the bracket matching the one at `open`, or -1. */
export function matchBracket(code, open, pair) {
  const [left, right] = pair;
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === left) depth += 1;
    else if (code[i] === right) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
