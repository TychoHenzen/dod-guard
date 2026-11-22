import { lineAt } from "./offsets.mjs";

const RUST_BOOLEAN_OR = /(?<!\b(?:move|return)\s{0,3})(?<=[\w)\]])\s{0,3}\|\|/g;
// A ternary `?` follows a space or `)`. A `?` glued to the token before it is
// a nullable type, and `??` is a null fallback, so neither is a branch.
const TERNARY = /(?<![\w>\]?])\?(?![.?:])/g;
// `x? y : z` has no space before `?`, so it looks like a nullable type. A real
// ternary reaches its `:` before any `;`, brace or assignment; a nullable
// declaration (`int? w = F();`, `List<int?> v;`) does not.
const GLUED_TERNARY =
  /(?<=[\w>\]])\?(?![.?:=[])(?=(?:[^;{}=:]|[=!<>]=)*:)/g;
const DECISION_PATTERNS = {
  common: [
    /\bif\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /&&/g,
  ],
  ts: [TERNARY, GLUED_TERNARY, /\|\|/g],
  cs: [TERNARY, GLUED_TERNARY, /\bwhen\b/g, /\|\|/g],
  rs: [/=>/g, RUST_BOOLEAN_OR],
  py: [/\belif\b/g, /\band\b/g, /\bor\b/g],
  go: [/\bselect\b/g, /\|\|/g],
  java: [/\?(?![.?:])/g, /\|\|/g],
  cpp: [/\?(?![.?:])/g, /\|\|/g],
};

function countMatches(text, patterns) {
  let total = 0;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const found = text.match(pattern);
    if (found) total += found.length;
  }
  return total;
}

export function complexityOf(body, lang) {
  return (
    1 +
    countMatches(body, [
      ...DECISION_PATTERNS.common,
      ...(DECISION_PATTERNS[lang] ?? []),
    ])
  );
}

// `indents` starts with the def line, then one entry per logical line of the
// body. The stack holds the indentation of each open block, the way Python's
// own tokenizer does, so 2-space and 4-space files count the same. The body
// itself is level 0, matching braceNesting, which drops the function's own
// braces.
function indentNesting(indents) {
  const open = [indents[0]];
  let max = 0;
  for (const indent of indents.slice(1)) {
    while (open.length > 1 && indent < open.at(-1)) {
      open.pop();
    }
    if (indent > open.at(-1)) {
      open.push(indent);
    }
    max = Math.max(max, open.length - 2);
  }
  return max;
}

function braceNesting(body) {
  let depth = 0;
  let max = 0;
  for (const ch of body) {
    if (ch === "{") {
      depth += 1;
      max = Math.max(max, depth);
      continue;
    }
    if (ch === "}") depth -= 1;
  }
  return Math.max(0, max - 1);
}

export function maxNesting(fn) {
  return fn.logicalIndents
    ? indentNesting(fn.logicalIndents)
    : braceNesting(fn.body);
}

export function functionLines(fn, starts) {
  return lineAt(starts, fn.end) - fn.line + 1;
}
