const CLOSING_BRACKETS = ")]}";

function expressionEndAt(ch, depth, index) {
  if (depth === 0 && CLOSING_BRACKETS.includes(ch)) return index - 1;
  if (depth === 0 && [",", ";"].includes(ch)) return index - 1;
  return null;
}

function expressionDepth(depth, ch) {
  if ("([{".includes(ch)) return depth + 1;
  if (CLOSING_BRACKETS.includes(ch)) return depth - 1;
  return depth;
}

export function findExpressionEnd(code, from) {
  let depth = 0;
  for (let i = from; i < code.length; i += 1) {
    const end = expressionEndAt(code[i], depth, i);
    if (end !== null) return end;
    depth = expressionDepth(depth, code[i]);
  }
  return code.length - 1;
}
