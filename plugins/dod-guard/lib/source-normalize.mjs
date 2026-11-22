import { stringStateAfter } from "./string-state.mjs";

const SLASH = "//";
const HASH = "#";
const COMMENT_PREFIX = Object.freeze({
  ".cs": SLASH,
  ".gd": HASH,
  ".js": SLASH,
  ".mjs": SLASH,
  ".py": HASH,
  ".rs": SLASH,
  ".ts": SLASH,
});
const INDENT_SIGNIFICANT = new Set([".gd", ".py"]);
const LINE_BREAK = /\r?\n/;
function extensionOf(file) {
  const dot = file.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return file.slice(dot).toLowerCase();
}
function isDropped(line, prefix) {
  const text = line.trim();
  return text === "" || text.startsWith(prefix);
}
// Whitespace is trimmed only where it cannot be string content: a line that starts inside a
// string stays verbatim, and a line that ends inside one keeps its trailing whitespace.
function comparable(raw, { extension, starts, ends }) {
  if (starts) {
    return raw;
  }
  let text = raw;
  if (!INDENT_SIGNIFICANT.has(extension)) {
    text = text.trimStart();
  }
  if (!ends) {
    text = text.trimEnd();
  }
  return text;
}
function behaviorLines(text, { extension, prefix }) {
  const kept = [];
  let state = null;
  for (const raw of text.split(LINE_BREAK)) {
    if (state !== null || !isDropped(raw, prefix)) {
      const next = stringStateAfter(raw, state);
      kept.push(comparable(raw, { extension, starts: state !== null, ends: next !== null }));
      state = next;
    }
  }
  return kept;
}
function comparableLines(text, file) {
  const extension = extensionOf(file);
  const prefix = COMMENT_PREFIX[extension];
  if (prefix === undefined) {
    return null;
  }
  return behaviorLines(text, { extension, prefix });
}
function sameBehavior({ before, after, file }) {
  const left = comparableLines(before, file);
  const right = comparableLines(after, file);
  return left !== null && right !== null && left.join("\n") === right.join("\n");
}

export { sameBehavior };
