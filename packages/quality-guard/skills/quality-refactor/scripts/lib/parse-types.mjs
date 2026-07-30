// Type declaration extraction.

import { lineAt } from "./offsets.mjs";

const TYPE_KEYWORDS = {
  ts: /\b(?:abstract\s+)?(class|interface|enum|type)\s+([A-Za-z_$][\w$]*)/g,
  cs: /\b(class|interface|struct|enum|record)\s+([A-Za-z_]\w*)/g,
  rs: /\b(struct|enum|trait|union)\s+([A-Za-z_]\w*)/g,
  go: /\btype\s+([A-Za-z_]\w*)\s+(struct|interface)\b/g,
  java: /\b(class|interface|enum|record)\s+([A-Za-z_]\w*)/g,
  cpp: /\b(class|struct|enum)\s+([A-Za-z_]\w*)/g,
  py: /^class\s+([A-Za-z_]\w*)/gm,
};

/**
 * Braces that group rather than nest. A C# `namespace` or a Rust `mod` wraps
 * the whole file, so counting its brace would make every type look nested and
 * silently disable the one-type-per-file rule.
 */
const CONTAINER_BLOCK = /\b(?:namespace|mod|package)\s+[\w.:]*\s*\{/g;

function containerOpens(code) {
  const opens = new Set();
  CONTAINER_BLOCK.lastIndex = 0;
  let match = CONTAINER_BLOCK.exec(code);
  while (match !== null) {
    opens.add(match.index + match[0].length - 1);
    match = CONTAINER_BLOCK.exec(code);
  }
  return opens;
}

/**
 * Forward-only brace depth. Returns a function that reports the depth at an
 * offset; offsets must be requested in increasing order, which is what a
 * global regex produces.
 */
function depthTracker(code) {
  const skip = containerOpens(code);
  const stack = [];
  let cursor = 0;
  let depth = 0;
  return (offset) => {
    while (cursor < offset) {
      if (code[cursor] === "{") {
        const skipped = skip.has(cursor);
        stack.push(skipped);
        if (!skipped) depth += 1;
      } else if (code[cursor] === "}" && stack.pop() === false) depth -= 1;
      cursor += 1;
    }
    return depth;
  };
}

/** Top-level type declarations only — nested types are a different concern. */
export function findTypes(code, lang, starts) {
  const pattern = TYPE_KEYWORDS[lang];
  if (!pattern) return [];
  const isPy = lang === "py";
  const depthAt = depthTracker(code);
  const found = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(code);
  while (match !== null) {
    const name = lang === "go" || isPy ? match[1] : match[2];
    if (isPy || depthAt(match.index) === 0) {
      found.push({ name, line: lineAt(starts, match.index), offset: match.index });
    }
    match = pattern.exec(code);
  }
  return found;
}
