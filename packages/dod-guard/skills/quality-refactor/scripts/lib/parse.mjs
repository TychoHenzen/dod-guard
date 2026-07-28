// Function extraction: signatures, parameter lists, and body spans.
//
// Operates on stripped code only (see strip.mjs). This is a heuristic scanner,
// not a parser — it is tuned to be quiet on false positives rather than to
// achieve full coverage, because a noisy metric gets ignored.

import { lineAt, matchBracket } from "./offsets.mjs";

/** Words that take a parenthesized clause but are not functions. */
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

/** Split a parameter list on top-level commas. Empty list -> []. */
function splitParams(text) {
  const params = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if ("([{<".includes(ch)) depth += 1;
    else if (")]}>".includes(ch)) depth -= 1;
    if (ch === "," && depth === 0) {
      params.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  params.push(current);
  const named = params.map((param) => param.trim());
  return named.filter((param) => param.length > 0 && param !== "self" && param !== "this");
}

/**
 * Operators that can only appear between a call and a following brace, never
 * between a signature and its body. `byFile.get(key) ?? {}` is a call whose
 * result feeds an object literal — without this it reads as a definition.
 */
const CALL_OPERATORS = /\?\?|\?\.|&&|\|\||(?:^|[^=!<>])=(?:[^>=]|$)/;

function isCallGap(gap) {
  return CALL_OPERATORS.test(gap) || gap.trimEnd().endsWith("?");
}

function arrowBody(code, from) {
  let i = from;
  while (i < code.length && /\s/.test(code[i])) i += 1;
  if (i >= code.length) return null;
  return code[i] === "{" ? { offset: i, kind: "block" } : { offset: i, kind: "expression" };
}

function nextAngle(angle, ch) {
  if (ch === "<") return angle + 1;
  if (ch === ">" && angle > 0) return angle - 1;
  return angle;
}

/** `undefined` means keep scanning; `null` means this was a call, not a body. */
function classifyBodyChar(code, i, gap) {
  if (code.startsWith("=>", i)) return arrowBody(code, i + 2);
  const ch = code[i];
  if (ch === "{") return isCallGap(gap) ? null : { offset: i, kind: "block" };
  if (ch === ";" || ch === ")" || ch === "]") return null;
  return undefined;
}

/**
 * After the parameter list, is this a definition (has a body) or a call?
 *
 * Bracket depth is tracked so that punctuation inside a return type is not
 * read as the end of the signature: `Promise<{ ok: boolean }>` must not look
 * like a body, and `-> (u32, u32)` must not look like a terminator.
 */
function bodyStart(code, afterParams) {
  const limit = Math.min(code.length, afterParams + 300);
  let angle = 0;
  let depth = 0;
  let gap = "";
  for (let i = afterParams; i < limit; i += 1) {
    const ch = code[i];
    if (ch === "(" || ch === "[") depth += 1;
    else if ((ch === ")" || ch === "]") && depth > 0) depth -= 1;
    else {
      angle = nextAngle(angle, ch);
      if (angle === 0 && depth === 0) {
        const outcome = classifyBodyChar(code, i, gap);
        if (outcome !== undefined) return outcome;
      }
    }
    gap += ch;
  }
  return null;
}

function findExpressionEnd(code, from) {
  let depth = 0;
  for (let i = from; i < code.length; i += 1) {
    const ch = code[i];
    if ("([{".includes(ch)) depth += 1;
    else if (")]}".includes(ch)) {
      if (depth === 0) return i - 1;
      depth -= 1;
    } else if ((ch === ";" || ch === ",") && depth === 0) return i - 1;
  }
  return code.length - 1;
}

/** `name(` — plain functions, methods, constructors. */
const HEADER_DIRECT = /([A-Za-z_$][\w$]*)\s*(?:<[^<>()]*>)?\s*\(/g;
/** `const name = (` / `name: (` — arrow functions and function expressions. */
const HEADER_ASSIGNED = /([A-Za-z_$][\w$]*)\s*(?::[^=;{}()]*)?=\s*(?:async\s+)?(?:function\s*)?\(/g;

function extractAt(code, starts, name, openParen, headerStart) {
  if (NOT_CALLABLE.has(name)) return null;
  const closeParen = matchBracket(code, openParen, "()");
  if (closeParen === -1) return null;
  const body = bodyStart(code, closeParen + 1);
  if (body === null) return null;
  const isBlock = body.kind === "block";
  const end = isBlock ? matchBracket(code, body.offset, "{}") : findExpressionEnd(code, body.offset);
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

function scanHeaders(code, starts, pattern, found) {
  pattern.lastIndex = 0;
  let match = pattern.exec(code);
  while (match !== null) {
    const openParen = match.index + match[0].length - 1;
    const fn = extractAt(code, starts, match[1], openParen, match.index);
    if (fn !== null) {
      found.set(fn.start, fn);
      pattern.lastIndex = fn.start + 1;
    }
    match = pattern.exec(code);
  }
}

function braceLanguageFunctions(code, starts) {
  const found = new Map();
  scanHeaders(code, starts, HEADER_ASSIGNED, found);
  scanHeaders(code, starts, HEADER_DIRECT, found);
  return [...found.values()].sort((a, b) => a.start - b.start);
}

function indentOf(line) {
  const match = /^[ \t]*/.exec(line);
  return match[0].replace(/\t/g, "    ").length;
}

function bodyLastLine(lines, first, baseIndent) {
  let last = first;
  for (let j = first + 1; j < lines.length; j += 1) {
    if (lines[j].trim() === "") continue;
    if (indentOf(lines[j]) <= baseIndent) break;
    last = j;
  }
  return last;
}

function pythonFunctions(code, starts) {
  const lines = code.split("\n");
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(lines[i]);
    if (!match) continue;
    const baseIndent = indentOf(lines[i]);
    const last = bodyLastLine(lines, i, baseIndent);
    const openParen = code.indexOf("(", starts[i]);
    const closeParen = matchBracket(code, openParen, "()");
    const end = last + 1 < starts.length ? starts[last + 1] - 1 : code.length - 1;
    found.push({
      name: match[1],
      line: i + 1,
      params: splitParams(closeParen === -1 ? "" : code.slice(openParen + 1, closeParen)),
      headerStart: starts[i],
      start: starts[i],
      end,
      body: code.slice(starts[i], end + 1),
      indentBased: true,
      baseIndent,
    });
  }
  return found;
}

export function findFunctions(code, lang, starts) {
  return lang === "py" ? pythonFunctions(code, starts) : braceLanguageFunctions(code, starts);
}
