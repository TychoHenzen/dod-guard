// Git writes a path containing non-ASCII bytes, quotes, or control characters as
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
const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;
const NEWLINE = /\r?\n/u;

// Octal escapes are raw bytes of one UTF-8 sequence, so decode bytes, not characters.
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
  return decoded.replace(SIDE_PREFIX, "");
}

// Reads the path from a `--- ` or `+++ ` line.
function sideLinePath(line) {
  return unquoteDiffPath(line.slice(SIDE_LINE_PREFIX_LENGTH));
}

// A deleted file's `+++ /dev/null` side has no final state, so it records nothing.
function selectDiffFile(line, changed) {
  const file = sideLinePath(line);
  if (file === null) {
    return;
  }
  if (!changed.has(file)) {
    changed.set(file, new Set());
  }
  return file;
}

function startHunk(state, hunk) {
  state.oldLeft = Number(hunk[1] ?? 1);
  state.finalLine = Number(hunk[2]);
  state.newLeft = Number(hunk[3] ?? 1);
}

// Inside a hunk only the first character classifies a line, so an added `++i;` is content, not a header.
function recordHunkLine(state, line, changed) {
  const marker = line[0];
  if (marker === "+" || marker === " ") {
    if (marker === "+" && state.file) {
      changed.get(state.file).add(state.finalLine);
    }
    state.finalLine += 1;
    state.newLeft -= 1;
  }
  if (marker === "-" || marker === " ") {
    state.oldLeft -= 1;
  }
}

function recordDiffLine(state, line, changed) {
  if (state.oldLeft > 0 || state.newLeft > 0) {
    recordHunkLine(state, line, changed);
    return;
  }
  const hunk = line.match(HUNK_HEADER);
  if (hunk) {
    startHunk(state, hunk);
  } else if (line.startsWith("+++ ")) {
    state.file = selectDiffFile(line, changed);
  }
}

// Maps each post-image path to the final-state line numbers the diff adds.
function parseChangedLines(diff) {
  const changed = new Map();
  const state = { file: undefined, finalLine: 0, oldLeft: 0, newLeft: 0 };
  for (const line of diff.split(NEWLINE)) {
    recordDiffLine(state, line, changed);
  }
  return changed;
}

export { parseChangedLines, sideLinePath };
