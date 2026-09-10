import { lineAt, matchBracket } from "./offsets.mjs";
import { bodyStart, isCallable, splitParams } from "./parse-expressions.mjs";
import { findExpressionEnd } from "./parse-expression-end.mjs";

const HEADER_DIRECT = /([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*>)?\s*\(/g;
const HEADER_ASSIGNED =
  /([A-Za-z_$][\w$]*)\s*(?::[^=;{}()]*)?=\s*(?:async\s+)?(?:function\s*)?\(/g;
const HEADER_RUST = /\bfn\s+([A-Za-z_]\w*)\s*(?:<[^<>()]*>)?\s*\(/g;
const HEADER_GO =
  /\bfunc\s+(?:\([^()]*\)\s+)?([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\(/g;

function bodyEnd(code, body) {
  return body.kind === "block"
    ? matchBracket(code, body.offset, "{}")
    : findExpressionEnd(code, body.offset);
}

function extractAt({ code, starts, name, openParen, headerStart }) {
  if (!isCallable(name)) return null;
  const closeParen = matchBracket(code, openParen, "()");
  if (closeParen === -1) return null;
  const body = bodyStart(code, closeParen + 1);
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

function scanHeaders({ code, starts, pattern, found }) {
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
    });
    if (fn !== null) {
      found.set(fn.start, fn);
      pattern.lastIndex = fn.start + 1;
    }
    match = pattern.exec(code);
  }
}

function scanLanguage(code, starts, patterns) {
  const found = new Map();
  for (const pattern of patterns) scanHeaders({ code, starts, pattern, found });
  return [...found.values()].sort((left, right) => left.start - right.start);
}

export function braceLanguageFunctions(code, starts) {
  return scanLanguage(code, starts, [HEADER_ASSIGNED, HEADER_DIRECT]);
}

export function rustFunctions(code, starts) {
  return scanLanguage(code, starts, [HEADER_RUST]);
}

export function goFunctions(code, starts) {
  return scanLanguage(code, starts, [HEADER_GO]);
}
