// Parses an EditorConfig section name into the tokens editorconfig-glob.mjs
// matches. `*` and `?` never cross a "/", `**` does, `{a,b}` lists
// alternatives, `{n1..n2}` is a numeric range, and `[seq]` is a character set
// (`[!seq]` negates it). Tokens:
//   { kind: "char", test }       one character that passes `test`
//   { kind: "repeat", test }     zero or more characters that pass `test`
//   { kind: "alt", options }     any one of several token sequences
//   { kind: "range", low, high } a number between two BigInt endpoints

const NUMERIC_RANGE = /^(-?\d+)\.\.(-?\d+)$/;

const notSlash = (c) => c !== "/";
const anyChar = () => true;
const literal = (ch) => ({ kind: "char", test: (c) => c === ch });
const STAR = { kind: "repeat", test: notSlash };
const GLOBSTAR = { kind: "repeat", test: anyChar };

// "**/" matches nothing, or any run of characters that ends in "/".
export const DIRECTORIES = {
  kind: "alt",
  options: [[], [GLOBSTAR, literal("/")]],
};

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

// [low, high] character spans; "a-z" is a span, a "-" at either end is
// itself a member.
function setSpans(content) {
  const spans = [];
  let k = 0;
  while (k < content.length) {
    const isSpan = content[k + 1] === "-" && k + 2 < content.length;
    spans.push([content[k], isSpan ? content[k + 2] : content[k]]);
    k += isSpan ? 3 : 1;
  }
  return spans;
}

// A reversed span such as "z-a" throws, so the whole section never matches.
function characterSet(content) {
  const negated = content.startsWith("!");
  const spans = setSpans(negated ? content.slice(1) : content);
  if (spans.some(([low, high]) => low > high)) {
    throw new RangeError(`reversed character span in [${content}]`);
  }
  const inSet = (c) => spans.some(([low, high]) => low <= c && c <= high);
  return { kind: "char", test: negated ? (c) => !inSet(c) : inSet };
}

function rangeToken(first, second) {
  const ascending = first <= second;
  return {
    kind: "range",
    low: ascending ? first : second,
    high: ascending ? second : first,
  };
}

// A brace with one part and no range is literal text around its contents.
function braceBody(inner) {
  const range = NUMERIC_RANGE.exec(inner);
  if (range) return rangeToken(BigInt(range[1]), BigInt(range[2]));
  const parts = topLevelParts(inner);
  if (parts.length > 1) return { kind: "alt", options: parts.map(parseGlob) };
  const text = [literal("{"), ...parseGlob(inner), literal("}")];
  return { kind: "alt", options: [text] };
}

// Each reader turns the text at `i` into [token, characters used], or null
// when the text there is not its kind.
function globstar(glob, i) {
  if (glob[i] !== "*" || glob[i + 1] !== "*") return null;
  return glob[i + 2] === "/" ? [DIRECTORIES, 3] : [GLOBSTAR, 2];
}

function wildcard(glob, i) {
  if (glob[i] === "*") return [STAR, 1];
  if (glob[i] === "?") return [{ kind: "char", test: notSlash }, 1];
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
  return [literal(glob[i + 1]), 2];
}

const READERS = [globstar, wildcard, bracket, brace, escaped];

// Any text no reader claims is a literal character.
function readToken(glob, i) {
  for (const read of READERS) {
    const token = read(glob, i);
    if (token !== null) return token;
  }
  return [literal(glob[i]), 1];
}

export function parseGlob(glob) {
  const tokens = [];
  let i = 0;
  while (i < glob.length) {
    const [token, length] = readToken(glob, i);
    tokens.push(token);
    i += length;
  }
  return tokens;
}
