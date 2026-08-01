// Blank out comments, string bodies, and regex literals so downstream
// regexes see only code.
//
// Every replaced character becomes a space and every newline is preserved, so
// offsets and line numbers in the stripped text match the original exactly.
// Nothing else in this scanner is allowed to regex raw source.
//
// A `ts` template literal is a special case. The literal text gets blanked
// like a string. But each `${...}` interpolation holds real code, so strip
// scans it too, using a small stack of frames: code, template text, and
// interpolation. A nested template inside an interpolation opens a new
// frame the same way, so nesting works to any depth.

const LINE_COMMENT = {
  ts: "//",
  cs: "//",
  rs: "//",
  go: "//",
  java: "//",
  cpp: "//",
  py: "#",
};

/**
 * Characters after which a `/` opens a regex rather than dividing. Without
 * this, a regex containing a quote - `/^r(#*)"/` - opens a phantom string
 * that swallows the rest of the file.
 */
const REGEX_AFTER = new Set("(,=:[!&|?{};+-*%<>~^\n");
const REGEX_AFTER_WORD = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "yield",
  "await",
]);

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

/** A regex literal ends at the first unescaped `/` outside a class. */
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
  if (lang !== "py" && src.startsWith("/*", i)) {
    return { end: readBlockComment(src, i), isComment: true };
  }
  const marker = LINE_COMMENT[lang] ?? "//";
  if (src.startsWith(marker, i)) {
    return { end: readLineComment(src, i), isComment: true };
  }
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
    const start = src[i] === "$" ? i + 1 : i;
    return { end: readVerbatim(src, start), isComment: false };
  },
  rs: (src, i) => {
    if (src[i] !== "r") return null;
    const end = readRawRust(src, i);
    return end === null ? null : { end, isComment: false };
  },
};

/** Backtick template literals go through the frame stack, not this. */
function tryString(src, i, lang) {
  const exotic = EXOTIC_STRINGS[lang]?.(src, i);
  if (exotic) return exotic;
  const ch = src[i];
  if (ch !== '"' && ch !== "'") return null;
  return { end: readQuoted(src, i, ch), isComment: false };
}

function tryRegex(src, i, lang, previous) {
  if (lang !== "ts" || src[i] !== "/") return null;
  const opensRegex =
    REGEX_AFTER.has(previous.char) || REGEX_AFTER_WORD.has(previous.word);
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

/** The comment/regex/string span starting here, if any. */
function matchSpan(state) {
  const { source, cursor, lang, previous } = state;
  const at = cursor.index;
  const comment = tryComment(source, at, lang);
  const found = comment ?? tryRegex(source, at, lang, previous);
  return found ?? tryString(source, at, lang);
}

/** True if a `ts` template literal opens at the cursor. */
function opensTemplate(state) {
  return state.lang === "ts" && state.source[state.cursor.index] === "`";
}

/** True if `${` opens an interpolation at the cursor. */
function opensInterp(state) {
  const { source, cursor } = state;
  return source[cursor.index] === "$" && source[cursor.index + 1] === "{";
}

/** Blank one matched span and record it if it is a comment. */
function consumeSpan(state, span) {
  const { source, cursor, comments, parts, previous } = state;
  const at = cursor.index;
  const raw = source.slice(at, span.end);
  if (span.isComment) comments.push({ line: cursor.line, text: raw });
  else previous.char = "x";
  parts.push(blank(raw));
  previous.word = "";
  cursor.index = span.end;
}

/** Pass one plain code character through untouched. */
function consumePlain(state) {
  const { source, cursor, parts, previous } = state;
  const ch = source[cursor.index];
  parts.push(ch);
  advancePrevious(previous, ch);
  cursor.index += 1;
}

/** Enter a template literal: blank the backtick, push a "template" frame. */
function openTemplate(state) {
  state.parts.push(" ");
  state.cursor.index += 1;
  state.stack.push({ kind: "template" });
  state.previous.char = "x";
  state.previous.word = "";
}

/** Leave a template literal: blank the closing backtick, pop the frame. */
function closeTemplate(state) {
  state.parts.push(" ");
  state.cursor.index += 1;
  state.stack.pop();
  state.previous.char = "x";
  state.previous.word = "";
}

/** Enter an interpolation: blank `${`, push an "interp" frame. */
function openInterp(state) {
  state.parts.push("  ");
  state.cursor.index += 2;
  state.stack.push({ kind: "interp", depth: 0 });
  state.previous.char = "{";
  state.previous.word = "";
}

/** Leave an interpolation: blank the closing `}`, pop the frame. */
function closeInterp(state) {
  state.parts.push(" ");
  state.cursor.index += 1;
  state.stack.pop();
  state.previous.char = "x";
  state.previous.word = "";
}

/** Blank a two-character escape inside template text. */
function consumeTemplateEscape(state) {
  const { source, cursor, parts } = state;
  const raw = source.slice(cursor.index, cursor.index + 2);
  parts.push(blank(raw));
  cursor.index += raw.length;
}

/** A newline stays a newline, any other template-text char becomes a space. */
function blankTemplateChar(ch) {
  return ch === "\n" ? "\n" : " ";
}

/**
 * `{` and `}` inside an interpolation nest until the matching `}` closes it.
 * Returns true when `ch` is the closing brace of the current interpolation.
 */
function trackBrace(frame, ch) {
  if (ch === "{") {
    frame.depth += 1;
    return false;
  }
  if (ch !== "}") return false;
  if (frame.depth === 0) return true;
  frame.depth -= 1;
  return false;
}

/** One step of plain code scanning: comments, regexes, strings, templates. */
function stepCode(state) {
  if (opensTemplate(state)) return openTemplate(state);
  const span = matchSpan(state);
  if (span) return consumeSpan(state, span);
  consumePlain(state);
}

/** One step inside `${...}`: code scanning, plus brace depth and templates. */
function stepInterp(state, frame) {
  if (opensTemplate(state)) return openTemplate(state);
  const span = matchSpan(state);
  if (span) return consumeSpan(state, span);
  const ch = state.source[state.cursor.index];
  if (trackBrace(frame, ch)) return closeInterp(state);
  consumePlain(state);
}

/** One step inside template literal text: escapes, backtick, or `${`. */
function stepTemplate(state) {
  const { source, cursor, parts } = state;
  const ch = source[cursor.index];
  if (ch === "\\") return consumeTemplateEscape(state);
  if (ch === "`") return closeTemplate(state);
  if (opensInterp(state)) return openInterp(state);
  parts.push(blankTemplateChar(ch));
  cursor.index += 1;
}

function dispatch(state) {
  const frame = state.stack[state.stack.length - 1];
  if (frame.kind === "template") return stepTemplate(state);
  if (frame.kind === "interp") return stepInterp(state, frame);
  return stepCode(state);
}

function createState(source, lang) {
  return {
    source,
    lang,
    cursor: { index: 0, line: 1, scanned: 0 },
    parts: [],
    comments: [],
    previous: { char: "\n", word: "" },
    stack: [{ kind: "code" }],
  };
}

/**
 * Returns `{ code, comments }` where `code` is the blanked source and
 * `comments` lists every comment span with its 1-based line and raw text.
 */
export function strip(source, lang) {
  const state = createState(source, lang);
  while (state.cursor.index < state.source.length) {
    advanceLine(state.source, state.cursor);
    dispatch(state);
  }
  return { code: state.parts.join(""), comments: state.comments };
}

function advanceLine(source, cursor) {
  while (cursor.scanned < cursor.index) {
    if (source[cursor.scanned] === "\n") cursor.line += 1;
    cursor.scanned += 1;
  }
}
