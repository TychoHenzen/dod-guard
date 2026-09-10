const NOT_CALLABLE = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "do",
  "else",
  "return",
  "with",
  "using",
  "lock",
  "fixed",
  "unsafe",
  "foreach",
  "match",
  "when",
  "new",
  "typeof",
  "sizeof",
  "await",
  "yield",
  "throw",
  "assert",
  "print",
  "and",
  "or",
  "not",
  "in",
  "is",
  "as",
]);
const RUST_SELF_RECEIVER = /^&?\s*(?:'[A-Za-z_]\w*\s+)?(?:mut\s+)?self$/;

function nextParamDepth(depth, ch) {
  if ("([{<".includes(ch)) return depth + 1;
  if (")]}>".includes(ch)) return depth - 1;
  return depth;
}

function splitTopLevel(text) {
  const params = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    depth = nextParamDepth(depth, ch);
    if (ch === "," && depth === 0) {
      params.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  params.push(current);
  return params;
}

function isParameter(param) {
  return (
    param.length > 0 && param !== "this" && !RUST_SELF_RECEIVER.test(param)
  );
}

export function splitParams(text) {
  return splitTopLevel(text)
    .map((param) => param.trim())
    .filter(isParameter);
}

export function isCallable(name) {
  return !NOT_CALLABLE.has(name);
}
