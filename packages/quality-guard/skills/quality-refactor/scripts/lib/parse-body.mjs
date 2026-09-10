const CALL_OPERATORS = /\?\?|\?\.|&&|\|\||(?:^|[^=!<>])=(?:[^>=]|$)/;

function isCallGap(gap) {
  return CALL_OPERATORS.test(gap) || gap.trimEnd().endsWith("?");
}

function arrowBody(code, from) {
  let i = from;
  while (i < code.length && /\s/.test(code[i])) i += 1;
  if (i >= code.length) return null;
  return code[i] === "{"
    ? { offset: i, kind: "block" }
    : { offset: i, kind: "expression" };
}

function nextAngle(angle, ch) {
  if (ch === "<") return angle + 1;
  if (ch === ">" && angle > 0) return angle - 1;
  return angle;
}

function classifyBodyChar(code, i, gap) {
  if (code.startsWith("=>", i)) return arrowBody(code, i + 2);
  if (code[i] === "{")
    return isCallGap(gap) ? null : { offset: i, kind: "block" };
  return ";)],".includes(code[i]) ? null : undefined;
}

function nestedBracket(ch, depth) {
  return "([".includes(ch) || (")]".includes(ch) && depth > 0);
}

function bodyState({ code, i, state, gap }) {
  const ch = code[i];
  if (nestedBracket(ch, state.depth))
    return { ...state, depth: nextParamDepth(state.depth, ch) };
  const angle = nextAngle(state.angle, ch);
  const outcome =
    angle === 0 && state.depth === 0
      ? classifyBodyChar(code, i, gap)
      : undefined;
  return { angle, depth: state.depth, outcome };
}

function nextParamDepth(depth, ch) {
  if ("([{<".includes(ch)) return depth + 1;
  if (")]}>".includes(ch)) return depth - 1;
  return depth;
}

export function bodyStart(code, afterParams) {
  const limit = Math.min(code.length, afterParams + 300);
  let state = { angle: 0, depth: 0 };
  let gap = "";
  for (let i = afterParams; i < limit; i += 1) {
    const next = bodyState({ code, i, state, gap });
    if (next.outcome !== undefined) return next.outcome;
    state = { angle: next.angle, depth: next.depth };
    gap += code[i];
  }
  return null;
}
