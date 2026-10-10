import { lineAt, matchBracket } from "./offsets.mjs";
import { bodyStart, isCallable, splitParams } from "./parse-expressions.mjs";
import { findExpressionEnd } from "./parse-expression-end.mjs";

const HEADER_DIRECT = /([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*>)?\s*\(/g;
const HEADER_ASSIGNED =
  /([A-Za-z_$][\w$]*)\s*(?::[^=;{}()]*)?=\s*(?:async\s+)?(?:function\s*)?\(/g;
const HEADER_RUST = /\bfn\s+([A-Za-z_]\w*)\s*(?:<[^<>()]*>)?\s*\(/g;
const HEADER_GO =
  /\bfunc\s+(?:\([^()]*\)\s+)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(/g;
const SPACE = /\s/;

function bodyEnd(code, body) {
  return body.kind === "block"
    ? matchBracket(code, body.offset, "{}")
    : findExpressionEnd(code, body.offset);
}

// A call in a ternary's true branch is followed by the ternary's ":", not a return type.
function precededByTernary(code, headerStart) {
  let i = headerStart - 1;
  while (i >= 0 && SPACE.test(code[i])) {
    i -= 1;
  }
  return i >= 0 && code[i] === "?";
}

// Only the ts path reads return types, so only it can mistake a ternary colon for one.
function bodyOptions(code, headerStart, options) {
  if (options?.returnTypeAnnotation && precededByTernary(code, headerStart)) {
    return {};
  }
  return options;
}

function extractAt({ code, starts, name, openParen, headerStart, options }) {
  if (!isCallable(name)) return null;
  const closeParen = matchBracket(code, openParen, "()");
  if (closeParen === -1) return null;
  const body = bodyStart(code, closeParen + 1, bodyOptions(code, headerStart, options));
  if (body === null) return null;
  const end = bodyEnd(code, body);
  if (end === -1) return null;
  return {
    name,
    line: lineAt(starts, headerStart),
    params: splitParams(code.slice(openParen + 1, closeParen)),
    headerStart,
    start: body.offset,
    end,
    body: code.slice(body.offset, end + 1),
  };
}

function scanHeaders({ code, starts, pattern, found, options }) {
  pattern.lastIndex = 0;
  let match = pattern.exec(code);
  while (match !== null) {
    const openParen = match.index + match[0].length - 1;
    const fn = extractAt({
      code,
      starts,
      name: match[1],
      openParen,
      headerStart: match.index,
      options,
    });
    if (fn !== null) {
      found.set(fn.start, fn);
      pattern.lastIndex = fn.start + 1;
    }
    match = pattern.exec(code);
  }
}

function scanLanguage(code, starts, patterns, options) {
  const found = new Map();
  for (const pattern of patterns) {
    scanHeaders({ code, starts, pattern, found, options });
  }
  return [...found.values()].sort((left, right) => left.start - right.start);
}

export function braceLanguageFunctions(code, starts) {
  return scanLanguage(code, starts, [HEADER_ASSIGNED, HEADER_DIRECT]);
}

// `source` is the raw text behind `code`, needed to see the quoted literals
// that strip blanked out of the code.
export function tsFunctions(code, starts, source) {
  const options = { returnTypeAnnotation: true, source };
  return scanLanguage(code, starts, [HEADER_ASSIGNED, HEADER_DIRECT], options);
}

export function rustFunctions(code, starts) {
  return scanLanguage(code, starts, [HEADER_RUST]);
}

export function goFunctions(code, starts) {
  return scanLanguage(code, starts, [HEADER_GO]);
}
