// Blank out comments, string bodies, and regex literals so downstream
// regexes see only code.
//
// Every replaced character becomes a space and every newline is preserved, so
// offsets and line numbers in the stripped text match the original exactly.
// Nothing else in this scanner is allowed to regex raw source.
//
// A `ts` template literal is a special case. The literal text gets blanked
// like a string. But each `${...}` interpolation holds real code, so strip
// scans it too. It uses a small stack of frames: code, template text, and
// interpolation. A nested template inside an interpolation opens a new
// frame the same way, so nesting works to any depth.
//
// A Rust format string and a C# interpolated string differ from that. Their
// `{...}` captures hold at most a bare identifier, never a statement. So
// walking one back into the code stream the way a `ts` template does is
// never worth it. Un-blanking one would also risk unbalancing the stream,
// because a string can carry a brace or a quote no rule expects. Instead
// strip reads the identifier out of each capture and returns it on its own,
// with its line. `code` stays blanked exactly as it always was.

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

/**
 * C# raw string opener: `"""` or longer (3+ quotes), optionally preceded by
 * one or more `$` for an interpolated raw string. The dollar count sets how
 * many braces open an interpolation inside the literal, but that content is
 * blanked here like the rest of the string, not scanned as code - a later
 * step collects the identifiers inside it. Returns the end of the opener
 * and the quote count the closer must match, or null when fewer than 3
 * quotes follow the dollar signs.
 */
function readRawCsOpener(src, i) {
  let j = i;
  while (src[j] === "$") j += 1;
  const dollarCount = j - i;
  let quotes = 0;
  while (src[j + quotes] === '"') quotes += 1;
  if (quotes < 3) return null;
  return { end: j + quotes, quoteCount: quotes, dollarCount };
}

/**
 * C# raw string body: blank through to the first run of at least
 * `quoteCount` double quotes. A closing run longer than the opener is
 * legal - the whole run is consumed as the closer. A shorter run of quotes
 * is just literal content and does not end the string.
 */
function readRawCsBody(src, start, quoteCount) {
  let i = start;
  while (i < src.length) {
    if (src[i] !== '"') {
      i += 1;
      continue;
    }
    let run = 0;
    while (src[i + run] === '"') run += 1;
    if (run >= quoteCount) return i + run;
    i += run;
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

/** `\u{...}` followed by a closing `'`, or null if it does not close there. */
function readRustUnicodeChar(src, backslash) {
  const close = src.indexOf("}", backslash + 3);
  return close !== -1 && src[close + 1] === "'" ? close + 2 : null;
}

/** After a backslash at `j`: a unicode escape, or a simple `\X'` escape. */
function readRustEscapeChar(src, j) {
  if (src[j + 1] === "u" && src[j + 2] === "{") return readRustUnicodeChar(src, j);
  return src[j + 2] === "'" ? j + 3 : null;
}

/**
 * Rust `'`. A char literal is a single character, a backslash escape, or a
 * unicode escape, closed by a `'`. Anything else is a lifetime: `'a`,
 * `'static`, `'_`. A lifetime is plain code, not a string. Returns the end
 * index of a char literal, or null when this is a lifetime.
 */
function readRustChar(src, i) {
  const j = i + 1;
  if (src[j] === "\\") return readRustEscapeChar(src, j);
  return src[j + 1] === "'" ? j + 2 : null;
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
    if (src.startsWith('@"', i) || src.startsWith('$@"', i)) {
      const start = src[i] === "$" ? i + 1 : i;
      const end = readVerbatim(src, start);
      const captures = src[i] === "$" ? { braceCount: 1, escaped: true } : null;
      return { end, isComment: false, captures };
    }
    const opener = readRawCsOpener(src, i);
    if (opener) {
      const end = readRawCsBody(src, opener.end, opener.quoteCount);
      // The dollar count is the number of braces this string needs to open
      // an interpolation, set at the opener per the raw-string spec S-02
      // already parses. A run of fewer braces is just literal content.
      const captures = opener.dollarCount > 0 ? { braceCount: opener.dollarCount, escaped: false } : null;
      return { end, isComment: false, captures };
    }
    // A plain interpolated string, `$"..."`: not verbatim (no `@`), not raw
    // (fewer than three quotes). The raw-opener check must run first, since
    // a raw interpolated string also starts with `$` then `"`.
    if (src[i] === "$" && src[i + 1] === '"') {
      return { end: readQuoted(src, i + 1, '"'), isComment: false, captures: { braceCount: 1, escaped: true } };
    }
    return null;
  },
  rs: (src, i) => {
    if (src[i] === "'") {
      const end = readRustChar(src, i);
      return end === null ? null : { end, isComment: false };
    }
    if (src[i] !== "r") return null;
    const end = readRawRust(src, i);
    return end === null ? null : { end, isComment: false };
  },
};

/** A Rust `'` that failed the char-literal check is a lifetime: plain code. */
function isRustLifetimeQuote(lang, ch) {
  return lang === "rs" && ch === "'";
}

/**
 * A plain Rust string is also a format string. `println!("{count}")` and
 * `format!("{}", total)` both read a binding through the literal itself,
 * not through a separate parameter list. So every double-quoted Rust string
 * is scanned for captures, not only those inside a `!` macro call. Telling
 * the two apart would need a real parse of the call site. Crediting a plain
 * string as a reference only risks under-reporting a dead symbol. That is
 * the same quiet-over-noisy trade this scanner makes everywhere else.
 */
function rustStringCaptures(lang, ch) {
  return lang === "rs" && ch === '"' ? { braceCount: 1, escaped: true } : null;
}

/** Backtick template literals go through the frame stack, not this. */
function tryString(src, i, lang) {
  const exotic = EXOTIC_STRINGS[lang]?.(src, i);
  if (exotic) return exotic;
  const ch = src[i];
  if (isRustLifetimeQuote(lang, ch)) return null;
  if (ch !== '"' && ch !== "'") return null;
  return { end: readQuoted(src, i, ch), isComment: false, captures: rustStringCaptures(lang, ch) };
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

/** Newlines in `text`, for advancing a line counter across a multi-line span. */
function countNewlines(text) {
  let count = 0;
  for (const ch of text) if (ch === "\n") count += 1;
  return count;
}

/**
 * Identifier-shaped tokens from one capture's content. The scan stops at
 * the first `:` or `?`, the two format-specifier delimiters this scanner
 * knows. So `{value:>8}`, `{value:?}` and `{ptr:p}` keep `value`, `value`
 * and `ptr`, and a bare specifier letter like `p` never reads as a name.
 * A positional or empty capture such as `{}` or `{0}` holds nothing before
 * the delimiter that starts with a letter or underscore. It yields no
 * identifier.
 */
function identifiersInCapture(content) {
  const colonAt = content.indexOf(":");
  const questionAt = content.indexOf("?");
  let cut = content.length;
  if (colonAt !== -1) cut = Math.min(cut, colonAt);
  if (questionAt !== -1) cut = Math.min(cut, questionAt);
  const relevant = content.slice(0, cut);
  return [...relevant.matchAll(/[A-Za-z_]\w*/g)].map((match) => ({ name: match[0], offset: match.index }));
}

/**
 * Whether a run of `run` consecutive brace characters opens or closes a
 * capture. Escaped mode covers Rust strings and C#'s plain and verbatim
 * interpolated forms. There only an exact match opens one. A doubled run is
 * the language's own escape for a literal brace, and must open nothing.
 * A C# raw interpolated string has no such escape. There any run of at
 * least `braceCount` opens, because `braceCount` is already sized to that
 * string's own dollar count at the opener.
 */
function isCaptureDelimiter(run, braceCount, escaped) {
  return escaped ? run === braceCount : run >= braceCount;
}

/** The offset of the closing brace run for a capture opened at `from`, or -1. */
function findCaptureClose(text, from, mode) {
  let j = from;
  while (j < text.length) {
    if (text[j] !== "}") {
      j += 1;
      continue;
    }
    let run = 0;
    while (text[j + run] === "}") run += 1;
    if (isCaptureDelimiter(run, mode.braceCount, mode.escaped)) return j;
    j += run;
  }
  return -1;
}

/** Every identifier in a found capture, each with the line it sits on. */
function readCapture(ctx, cursor, span) {
  const { text, mode } = ctx;
  const { start, captureStart, close } = span;
  const content = text.slice(captureStart, close);
  const openLine = cursor.line + countNewlines(text.slice(start, captureStart));
  const ids = identifiersInCapture(content).map(({ name, offset }) => ({
    name,
    line: openLine + countNewlines(content.slice(0, offset)),
  }));
  cursor.line += countNewlines(text.slice(start, close + mode.braceCount));
  cursor.index = close + mode.braceCount;
  return ids;
}

/**
 * `cursor.index` sits on a `{`. Finds the brace run's shape and, when it is
 * a real opener, the matching close. Advances `cursor` past whatever it
 * finds - a literal run, an unclosed opener, or a full capture - and
 * returns that capture's identifiers, or none.
 */
function openCapture(ctx, cursor) {
  const { text, mode } = ctx;
  const start = cursor.index;
  let run = 0;
  while (text[start + run] === "{") run += 1;
  if (!isCaptureDelimiter(run, mode.braceCount, mode.escaped)) {
    // Fewer braces than a raw string's threshold, an escaped `{{` pair, or
    // any other shape this scanner declines to guess at.
    cursor.index += run;
    return [];
  }
  const captureStart = start + mode.braceCount;
  const close = findCaptureClose(text, captureStart, mode);
  if (close === -1) {
    cursor.index += run;
    return [];
  }
  return readCapture(ctx, cursor, { start, captureStart, close });
}

/**
 * One step of the capture scan at `cursor.index`: a newline, plain text up
 * to the next `{`, or a brace run handed off to `openCapture`. Advances
 * `cursor` in place and returns any identifiers the step found.
 */
function captureStep(ctx, cursor) {
  const ch = ctx.text[cursor.index];
  if (ch === "\n") {
    cursor.line += 1;
    cursor.index += 1;
    return [];
  }
  if (ch !== "{") {
    cursor.index += 1;
    return [];
  }
  return openCapture(ctx, cursor);
}

/**
 * Identifiers read from `{...}` captures inside one string span. Each
 * carries its own line, not the line the string opened on, because a
 * multi-line raw string can hold a capture many lines past its opening
 * quote. `mode` is `{ braceCount, escaped }`, the same shape a matched
 * span's `captures` field carries.
 */
function extractCaptures(text, startLine, mode) {
  const found = [];
  const ctx = { text, mode };
  const cursor = { index: 0, line: startLine };
  while (cursor.index < text.length) {
    found.push(...captureStep(ctx, cursor));
  }
  return found;
}

/** Blank one matched span and record it if it is a comment. */
function consumeSpan(state, span) {
  const { source, cursor, comments, parts, previous, interpolations } = state;
  const at = cursor.index;
  const raw = source.slice(at, span.end);
  if (span.isComment) comments.push({ line: cursor.line, text: raw });
  else previous.char = "x";
  if (span.captures) {
    interpolations.push(...extractCaptures(raw, cursor.line, span.captures));
  }
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
    interpolations: [],
    previous: { char: "\n", word: "" },
    stack: [{ kind: "code" }],
  };
}

/**
 * Returns `{ code, comments, interpolations }`. `code` is the blanked
 * source and `comments` lists every comment span with its 1-based line and
 * raw text, as before. `interpolations` lists every identifier read out of
 * a Rust format capture or a C# interpolated string, each with the line the
 * identifier itself sits on.
 */
export function strip(source, lang) {
  const state = createState(source, lang);
  while (state.cursor.index < state.source.length) {
    advanceLine(state.source, state.cursor);
    dispatch(state);
  }
  return { code: state.parts.join(""), comments: state.comments, interpolations: state.interpolations };
}

function advanceLine(source, cursor) {
  while (cursor.scanned < cursor.index) {
    if (source[cursor.scanned] === "\n") cursor.line += 1;
    cursor.scanned += 1;
  }
}
