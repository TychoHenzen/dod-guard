// Matches an EditorConfig section name against a file path. `*` and `?` never
// cross a "/", `**` does, `{a,b}` and `{n1..n2}` list alternatives, and
// `[seq]` is a character set. A name with a "/" is anchored to the directory
// holding the .editorconfig; a name without one matches at any depth.

// ASSUMPTION: a numeric range wider than this never matches. Real sections
// use small ranges, and an enumerated range of a billion would exhaust memory.
const MAX_RANGE = 1000;
const NUMERIC_RANGE = /^(-?\d+)\.\.(-?\d+)$/;
const cache = new Map();

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeClass = (text) => text.replace(/[\\[\]^]/g, "\\$&");

// Index of the "}" closing the "{" at `open`, or -1 when none closes it.
function closingBrace(glob, open) {
  let depth = 0;
  for (let i = open; i < glob.length; i += 1) {
    if (glob[i] === "{") depth += 1;
    if (glob[i] === "}") depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}

// Splits brace contents on the commas that sit outside nested braces.
function topLevelParts(inner) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === "{") depth += 1;
    if (inner[i] === "}") depth -= 1;
    if (inner[i] === "," && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts;
}

function numericAlternatives(low, high) {
  const from = Math.min(low, high);
  const to = Math.max(low, high);
  if (to - from > MAX_RANGE) return "(?!)";
  const numbers = [];
  for (let n = from; n <= to; n += 1) numbers.push(String(n));
  return `(?:${numbers.join("|")})`;
}

function braceBody(inner) {
  const range = NUMERIC_RANGE.exec(inner);
  if (range) return numericAlternatives(Number(range[1]), Number(range[2]));
  const parts = topLevelParts(inner);
  if (parts.length === 1) return `\\{${translate(inner)}\\}`;
  return `(?:${parts.map(translate).join("|")})`;
}

function characterSet(content) {
  if (content.startsWith("!")) return `[^${escapeClass(content.slice(1))}]`;
  return `[${escapeClass(content)}]`;
}

// Each reader turns the token at `i` into [regex source, characters used],
// or null when the token is not its kind.
function globstar(glob, i) {
  if (glob[i] !== "*" || glob[i + 1] !== "*") return null;
  return glob[i + 2] === "/" ? ["(?:.*/)?", 3] : [".*", 2];
}

function wildcard(glob, i) {
  if (glob[i] === "*") return ["[^/]*", 1];
  if (glob[i] === "?") return ["[^/]", 1];
  return null;
}

// An empty "[]" or an unclosed "[" is a literal bracket.
function bracket(glob, i) {
  if (glob[i] !== "[") return null;
  const end = glob.indexOf("]", i + 1);
  if (end <= i + 1) return null;
  return [characterSet(glob.slice(i + 1, end)), end + 1 - i];
}

function brace(glob, i) {
  if (glob[i] !== "{") return null;
  const end = closingBrace(glob, i);
  if (end === -1) return null;
  return [braceBody(glob.slice(i + 1, end)), end + 1 - i];
}

function escaped(glob, i) {
  if (glob[i] !== "\\" || i + 1 >= glob.length) return null;
  return [escapeRegex(glob[i + 1]), 2];
}

const READERS = [globstar, wildcard, bracket, brace, escaped];

// Any token no reader claims is a literal character.
function readToken(glob, i) {
  for (const read of READERS) {
    const token = read(glob, i);
    if (token !== null) return token;
  }
  return [escapeRegex(glob[i]), 1];
}

function translate(glob) {
  let out = "";
  let i = 0;
  while (i < glob.length) {
    const [source, length] = readToken(glob, i);
    out += source;
    i += length;
  }
  return out;
}

function compile(pattern) {
  const anchored = pattern.includes("/");
  const body = translate(anchored ? pattern.replace(/^\//, "") : pattern);
  const prefix = anchored ? "" : "(?:.*/)?";
  return new RegExp(`^${prefix}${body}$`);
}

/**
 * True when the EditorConfig section `pattern` covers `relFromConfigDir`, the
 * file's path relative to the directory holding the .editorconfig.
 */
export function matchesSection(pattern, relFromConfigDir) {
  if (!cache.has(pattern)) {
    try {
      cache.set(pattern, compile(pattern));
    } catch {
      cache.set(pattern, null);
    }
  }
  const regex = cache.get(pattern);
  return regex !== null && regex.test(relFromConfigDir);
}
