// Blank out comments, string bodies, and regex literals so downstream
// regexes see only code.
//
// Every replaced character becomes a space and every newline is preserved, so
// offsets and line numbers in the stripped text match the original exactly.
// Nothing else in this scanner is allowed to regex raw source.

const LINE_COMMENT = { ts: "//", cs: "//", rs: "//", go: "//", java: "//", cpp: "//", py: "#" };

/**
 * Characters after which a `/` opens a regex rather than dividing. Without
 * this, a regex containing a quote — `/^r(#*)"/` — opens a phantom string
 * that swallows the rest of the file.
 */
const REGEX_AFTER = new Set("(,=:[!&|?{};+-*%<>~^\n");
const REGEX_AFTER_WORD = new Set(["return", "typeof", "case", "in", "of", "new", "delete", "void", "yield", "await"]);

function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

function readLineComment(src, start) {
  const end = src.indexOf("\n", start);
  return end === -1 ? src.length : end;
}

function readBlockComment(src, start) {
  const end = src.indexOf("*/", start + 2);
  return end === -1 ? src.length : end + 2;
}

function readQuoted(src, start, quote) {
  let i = start + quote.length;
  while (i < src.length) {
    if (src[i] === "\\") {
      i += 2;
      continue;
    }
    if (src.startsWith(quote, i)) return i + quote.length;
    i += 1;
  }
  return src.length;
}

/** C# verbatim strings: @"..." where "" is an escaped quote. */
function readVerbatim(src, start) {
  let i = start + 2;
  while (i < src.length) {
    if (src[i] !== '"') {
      i += 1;
      continue;
    }
    if (src[i + 1] === '"') {
      i += 2;
      continue;
    }
    return i + 1;
  }
  return src.length;
}

/** Rust raw strings: r"..." or r#"..."# with any number of hashes. */
function readRawRust(src, start) {
  const opener = /^r(#*)"/.exec(src.slice(start, start + 16));
  if (!opener) return null;
  const terminator = `"${opener[1]}`;
  const end = src.indexOf(terminator, start + opener[0].length);
  return end === -1 ? src.length : end + terminator.length;
}

/** A regex literal ends at the first unescaped `/` outside a character class. */
function readRegex(src, start) {
  let i = start + 1;
  let inClass = false;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "\n") return null;
    if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) {
      i += 1;
      while (i < src.length && /[a-z]/.test(src[i])) i += 1;
      return i;
    }
    i += 1;
  }
  return null;
}

function tryComment(src, i, lang) {
  if (lang !== "py" && src.startsWith("/*", i)) return { end: readBlockComment(src, i), isComment: true };
  const marker = LINE_COMMENT[lang] ?? "//";
  if (src.startsWith(marker, i)) return { end: readLineComment(src, i), isComment: true };
  return null;
}

/** Language-specific string forms, tried before the plain quoted form. */
const EXOTIC_STRINGS = {
  py: (src, i) => {
    const triple = src.slice(i, i + 3);
    if (triple !== '"""' && triple !== "'''") return null;
    return { end: readQuoted(src, i, triple), isComment: true };
  },
  cs: (src, i) => {
    if (!src.startsWith('@"', i) && !src.startsWith('$@"', i)) return null;
    return { end: readVerbatim(src, src[i] === "$" ? i + 1 : i), isComment: false };
  },
  rs: (src, i) => {
    if (src[i] !== "r") return null;
    const end = readRawRust(src, i);
    return end === null ? null : { end, isComment: false };
  },
};

function tryString(src, i, lang) {
  const exotic = EXOTIC_STRINGS[lang]?.(src, i);
  if (exotic) return exotic;
  const ch = src[i];
  if (ch !== '"' && ch !== "'" && ch !== "`") return null;
  return { end: readQuoted(src, i, ch), isComment: false };
}

function tryRegex(src, i, lang, previous) {
  if (lang !== "ts" || src[i] !== "/") return null;
  const opensRegex = REGEX_AFTER.has(previous.char) || REGEX_AFTER_WORD.has(previous.word);
  if (!opensRegex) return null;
  const end = readRegex(src, i);
  return end === null ? null : { end, isComment: false };
}

/** Track the last significant character and word, for regex disambiguation. */
function advancePrevious(previous, ch) {
  if (/\s/.test(ch)) {
    if (ch === "\n") previous.char = "\n";
    return;
  }
  previous.char = ch;
  if (/\w/.test(ch)) previous.word += ch;
  else previous.word = "";
}

/**
 * Returns `{ code, comments }` where `code` is the blanked source and
 * `comments` lists every comment span with its 1-based line and raw text.
 */
export function strip(source, lang) {
  const parts = [];
  const comments = [];
  const previous = { char: "\n", word: "" };
  const cursor = { index: 0, line: 1, scanned: 0 };
  while (cursor.index < source.length) {
    advanceLine(source, cursor);
    const at = cursor.index;
    const span = tryComment(source, at, lang) ?? tryRegex(source, at, lang, previous) ?? tryString(source, at, lang);
    if (!span) {
      parts.push(source[at]);
      advancePrevious(previous, source[at]);
      cursor.index += 1;
      continue;
    }
    const raw = source.slice(at, span.end);
    if (span.isComment) comments.push({ line: cursor.line, text: raw });
    else previous.char = "x";
    parts.push(blank(raw));
    previous.word = "";
    cursor.index = span.end;
  }
  return { code: parts.join(""), comments };
}

function advanceLine(source, cursor) {
  while (cursor.scanned < cursor.index) {
    if (source[cursor.scanned] === "\n") cursor.line += 1;
    cursor.scanned += 1;
  }
}
