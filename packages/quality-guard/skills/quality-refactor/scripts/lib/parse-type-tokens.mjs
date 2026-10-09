import { matchBracket } from "./offsets.mjs";

// Lexical helpers for the return-type reader in parse-return-type.mjs. They read
// the stripped code, whose offsets match the raw source. Only closingQuote and
// nextToken also take the raw source, because strip blanks quoted literals to
// whitespace and the quote characters are visible only there.

const GROUP_PAIR = { "{": "{}", "(": "()", "[": "[]" };
const ANGLE_DELTA = { "<": 1, ">": -1 };
const STATEMENT_END = ")]};";
const WORD = /[A-Za-z_$][\w$.]*/y;
const NUMBER = /-?\d[\w.]*/y;
const SPACE = /\s/;

// Offset just after the ">" that closes the "<" at `open`, or -1. A statement
// end or an unmatched closer inside the list means the list never closes.
function angleStep(code, i) {
  if (code.startsWith("=>", i)) {
    return i + 2;
  }
  if (isGroupOpen(code[i])) {
    const close = groupEnd(code, i);
    if (close === -1) {
      return -1;
    }
    return close + 1;
  }
  // ASSUMPTION: a statement end or a closer that matches nothing inside the
  // list means the list never closes, so the annotation reports -1 rather than
  // reading on into later statements.
  if (STATEMENT_END.includes(code[i])) {
    return -1;
  }
  return i + 1;
}

function angleEnd(code, open) {
  let depth = 0;
  let i = open;
  while (i < code.length) {
    const next = angleStep(code, i);
    if (next === -1) {
      return -1;
    }
    depth += ANGLE_DELTA[code[i]] ?? 0;
    i = next;
    if (depth === 0) {
      return i;
    }
  }
  return -1;
}

function quoteAt(source, i) {
  if (typeof source !== "string") {
    return false;
  }
  const ch = source[i];
  return ch === "'" || ch === '"' || ch === "`";
}

export function skipSpace(code, from) {
  let i = from;
  while (i < code.length && SPACE.test(code[i])) {
    i += 1;
  }
  return i;
}

// The dotted identifier that starts at `i`, or "" when none starts there.
export function wordAt(code, i) {
  WORD.lastIndex = i;
  return WORD.exec(code)?.[0] ?? "";
}

export function numberAt(code, i) {
  NUMBER.lastIndex = i;
  return NUMBER.exec(code)?.[0] ?? "";
}

export function isUnion(code, i) {
  const ch = code[i];
  return (ch === "|" || ch === "&") && code[i + 1] !== ch;
}

export function isGroupOpen(ch) {
  return GROUP_PAIR[ch] !== undefined;
}

// Offset of the bracket that closes the "{", "(" or "[" at `open`, or -1.
export function groupEnd(code, open) {
  const pair = GROUP_PAIR[code[open]];
  if (pair === undefined) {
    return -1;
  }
  return matchBracket(code, open, pair);
}

// Offset just after an optional ".member" continuation and optional generic
// arguments that follow a name, or -1 when the generic list never closes.
export function nameTail(code, from) {
  let end = from;
  const member = wordAt(code, end + 1);
  if (code[end] === "." && member !== "") {
    end += 1 + member.length;
  }
  const open = skipSpace(code, end);
  if (code[open] !== "<") {
    return end;
  }
  return angleEnd(code, open);
}

// Blanked literal text is whitespace in code, so a quote in the raw source at a
// skipped offset is where a literal operand starts.
export function nextToken(code, source, from) {
  let i = from;
  while (i < code.length && SPACE.test(code[i])) {
    // ASSUMPTION: a quote inside a blanked comment or regex literal that sits
    // where a type is expected is read as a literal start. Both need a ":"
    // right after a call's ")", which is rare, so the misread is accepted.
    if (quoteAt(source, i)) {
      return { quote: i };
    }
    i += 1;
  }
  return { at: i };
}

// Follows readQuoted in strip-readers.mjs, so the operand ends exactly where
// strip blanked it: a backslash skips the next character, and the literal may
// run across lines.
export function closingQuote(source, open) {
  const quote = source[open];
  let i = open + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
    } else if (source[i] === quote) {
      // ASSUMPTION: a template literal type whose interpolation itself contains
      // a backtick is not supported; the first backtick after it closes it.
      return i;
    } else {
      i += 1;
    }
  }
  return -1;
}
