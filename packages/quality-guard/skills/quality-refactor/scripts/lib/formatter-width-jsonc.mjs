// Biome accepts comments and trailing commas in biome.json as well as in
// biome.jsonc, so both go through this reader. String contents pass through
// untouched: "extends": "//" and the "https://" in "$schema" must survive.

const BYTE_ORDER_MARK = 0xfeff;
const CLOSER_AHEAD = /\s*[}\]]/y;

function stringEnd(text, start) {
  let index = start + 1;
  while (index < text.length && text[index] !== '"') {
    index += text[index] === "\\" ? 2 : 1;
  }
  return index + 1;
}

function keepString(text, index) {
  const end = stringEnd(text, index);
  return [text.slice(index, end), end];
}

// `step(text, index)` returns `[replacement, nextIndex]`; a negative
// nextIndex means the text cannot be read and the whole rewrite is null.
function rewriteOutsideStrings(text, step) {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const reader = text[index] === '"' ? keepString : step;
    const [piece, next] = reader(text, index);
    if (next < 0) return null;
    out += piece;
    index = next;
  }
  return out;
}

function commentEnd(text, index) {
  if (text.startsWith("//", index)) {
    const newline = text.indexOf("\n", index);
    return newline < 0 ? text.length : newline;
  }
  if (!text.startsWith("/*", index)) return index;
  const close = text.indexOf("*/", index + 2);
  return close < 0 ? -1 : close + 2;
}

function commentStep(text, index) {
  const end = commentEnd(text, index);
  return end === index ? [text[index], index + 1] : [" ", end];
}

function trailingCommaStep(text, index) {
  CLOSER_AHEAD.lastIndex = index + 1;
  const drop = text[index] === "," && CLOSER_AHEAD.test(text);
  return [drop ? "" : text[index], index + 1];
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Parse Biome's JSON dialect; null for anything but one JSON object. */
export function parseJsonc(text) {
  const body = text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text;
  const stripped = rewriteOutsideStrings(body, commentStep);
  if (stripped === null) return null;
  const json = rewriteOutsideStrings(stripped, trailingCommaStep);
  try {
    const value = JSON.parse(json);
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}
