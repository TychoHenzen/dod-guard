import { lineAt } from "./offsets.mjs";

const RUST_BOOLEAN_OR = /(?<!\b(?:move|return)\s{0,3})(?<=[\w)\]])\s{0,3}\|\|/g;
const DECISION_PATTERNS = {
  common: [
    /\bif\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /&&/g,
  ],
  ts: [/\?\?/g, /\?(?![.?:])/g, /\|\|/g],
  cs: [/\?\?/g, /\?(?![.?:])/g, /\bwhen\b/g, /\|\|/g],
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

function indentNesting(fn) {
  let max = 0;
  for (const line of fn.body.split("\n").slice(1)) {
    if (line.trim() === "") continue;
    const indent = /^[ \t]*/.exec(line)[0].replace(/\t/g, "    ").length;
    max = Math.max(max, Math.floor((indent - fn.baseIndent) / 4));
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
  return fn.indentBased ? indentNesting(fn) : braceNesting(fn.body);
}

export function functionLines(fn, starts) {
  return lineAt(starts, fn.end) - fn.line + 1;
}
