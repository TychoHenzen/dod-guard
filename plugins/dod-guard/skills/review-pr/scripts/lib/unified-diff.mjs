// Git writes a path containing non-ASCII bytes, quotes, or control characters
// as
// a C-style quoted string ("b/docs/\303\274.md"), and ends `---`/`+++` lines
// with a TAB when the path contains a space. parseChangedLines must decode both
// forms, or such a file loses its changed lines and its findings.
const SIMPLE_ESCAPES = new Map([
  ["a", "\u0007"],
  ["b", "\b"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
  ["v", "\v"],
]);
// An octal byte escape, any other escaped character, or a run of literal text.
const QUOTED_TOKEN = /\\([0-7]{3})|\\(.)|([^\\]+)/gsu;
const OCTAL_RADIX = 8;
const SIDE_PREFIX = /^[ab]\//u;
const TRAILING_TERMINATOR = /\t?\r?$/u;
const SIDE_LINE_PREFIX_LENGTH = 4;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;
const NEWLINE = /\r?\n/u;

// Octal escapes are raw bytes of one UTF-8 sequence, so decode bytes, not
// characters.
function quotedTokenBytes([, octal, escaped, literal]) {
  if (octal) {
    return Buffer.of(Number.parseInt(octal, OCTAL_RADIX));
  }
  return Buffer.from(literal ?? SIMPLE_ESCAPES.get(escaped) ?? escaped, "utf8");
}

function decodeQuotedPath(value) {
  if (!(value.startsWith('"') && value.endsWith('"'))) {
    return value;
  }
  const body = value.slice(1, -1);
  return Buffer.concat([...body.matchAll(QUOTED_TOKEN)].map(quotedTokenBytes)).toString("utf8");
}

// Returns the repository path for one side of a diff, or null for /dev/null.
function unquoteDiffPath(raw) {
  const decoded = decodeQuotedPath(raw.replace(TRAILING_TERMINATOR, ""));
  if (decoded === "/dev/null") {
    return null;
  }
  // diff.mnemonicPrefix or diff.noprefix would otherwise leave a path that
  // matches no repository file.
  if (!SIDE_PREFIX.test(decoded)) {
    throw new Error(
      `Diff path ${decoded} lacks the a/ or b/ prefix; rerun git diff with --src-prefix=a/ --dst-prefix=b/`,
    );
  }
  return decoded.replace(SIDE_PREFIX, "");
}

// Reads the path from a `--- ` or `+++ ` line.
function sideLinePath(line) {
  return unquoteDiffPath(line.slice(SIDE_LINE_PREFIX_LENGTH));
}

// A deleted file's `+++ /dev/null` side has no final state, so it records
// nothing.
function selectDiffFile(line, changed) {
  const file = sideLinePath(line);
  if (file === null) {
    return;
  }
  if (!changed.added.has(file)) {
    changed.added.set(file, new Set());
    changed.removed.set(file, new Set());
  }
  return file;
}

function startHunk(state, hunk) {
  state.oldLine = Number(hunk[1]);
  state.oldLeft = Number(hunk[2] ?? 1);
  state.finalLine = Number(hunk[3]);
  state.newLeft = Number(hunk[4] ?? 1);
}

const FINAL_SIDE = new Set(["+", " "]);
const OLD_SIDE = new Set(["-", " "]);

function advanceHunk(state, marker) {
  if (FINAL_SIDE.has(marker)) {
    state.finalLine += 1;
    state.newLeft -= 1;
  }
  if (OLD_SIDE.has(marker)) {
    state.oldLine += 1;
    state.oldLeft -= 1;
  }
}

function addLine(lines, file, number) {
  if (file) {
    lines.get(file).add(number);
  }
}

// Inside a hunk only the first character classifies a line, so an added `++i;`
// is content, not a header.
function recordHunkLine(state, line, changed) {
  const marker = line[0];
  if (marker === "+") {
    addLine(changed.added, state.file, state.finalLine);
  }
  if (marker === "-") {
    addLine(changed.removed, state.file, state.oldLine);
  }
  advanceHunk(state, marker);
}

function recordDiffLine(state, line, changed) {
  if (state.oldLeft > 0 || state.newLeft > 0) {
    recordHunkLine(state, line, changed);
    return;
  }
  const hunk = line.match(HUNK_HEADER);
  if (hunk) {
    startHunk(state, hunk);
    return;
  }
  if (line.startsWith("+++ ")) {
    state.file = selectDiffFile(line, changed);
  }
}

// Maps each post-image path to the final-state line numbers the diff adds
// (`added`) and to the original-state line numbers it removes (`removed`).
function parseDiffLines(diff) {
  const changed = { added: new Map(), removed: new Map() };
  const state = { file: undefined, finalLine: 0, oldLine: 0, oldLeft: 0, newLeft: 0 };
  for (const line of diff.split(NEWLINE)) {
    recordDiffLine(state, line, changed);
  }
  return changed;
}

function parseChangedLines(diff) {
  return parseDiffLines(diff).added;
}

export { parseChangedLines, parseDiffLines };
