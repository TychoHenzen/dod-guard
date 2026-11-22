// The review payload and the project's files must stay ASCII, so punctuation
// with a plain equivalent folds to it. The keys are built from code points
// because the formatter rewrites a \u escape into the literal character, which
// would make this source file non-ASCII.
const FOLDS = new Map([
  [0x2014, "-"],
  [0x2013, "-"],
  [0x2018, "'"],
  [0x2019, "'"],
  [0x201c, '"'],
  [0x201d, '"'],
  [0x2026, "..."],
  [0x2192, "->"],
  [0x2190, "<-"],
  [0x00a0, " "],
]);
const ASCII_LIMIT = 0x7f;
const MIN_HEX_DIGITS = 4;

function foldCodePoint(char) {
  const code = char.codePointAt(0);
  if (code <= ASCII_LIMIT) {
    return char;
  }
  return FOLDS.get(code) ?? `<U+${code.toString(16).toUpperCase().padStart(MIN_HEX_DIGITS, "0")}>`;
}

function asciiText(value) {
  return Array.from(String(value), foldCodePoint).join("");
}

export { asciiText };
