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

function translate(glob) {
  let out = "";
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i];
    if (ch === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      out += slash ? "(?:.*/)?" : ".*";
      i += slash ? 3 : 2;
    } else if (ch === "*") {
      out += "[^/]*";
      i += 1;
    } else if (ch === "?") {
      out += "[^/]";
      i += 1;
    } else if (ch === "[" && glob.indexOf("]", i + 1) > i + 1) {
      const end = glob.indexOf("]", i + 1);
      out += characterSet(glob.slice(i + 1, end));
      i = end + 1;
    } else if (ch === "{" && closingBrace(glob, i) !== -1) {
      const end = closingBrace(glob, i);
      out += braceBody(glob.slice(i + 1, end));
      i = end + 1;
    } else if (ch === "\\" && i + 1 < glob.length) {
      out += escapeRegex(glob[i + 1]);
      i += 2;
    } else {
      out += escapeRegex(ch);
      i += 1;
    }
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
