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
// ASSUMPTION: these openers can start a string that spans lines. An odd count of them on the kept lines so far means a
// later comment-looking line may be string content, so the file reads as code-changed.
const STRING_OPENERS = Object.freeze(['"""', "'''", "`", '@"', 'r#"']);
function extensionOf(file) {
  const dot = file.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return file.slice(dot).toLowerCase();
}
function openerCount(line) {
  return STRING_OPENERS.reduce((sum, opener) => sum + line.split(opener).length - 1, 0);
}
function isDropped(line, prefix) {
  const text = line.trim();
  return text === "" || text.startsWith(prefix);
}
function trimmed(raw, extension) {
  if (INDENT_SIGNIFICANT.has(extension)) {
    return raw.trimEnd();
  }
  return raw.trim();
}
function behaviorLines(text, { extension, prefix }) {
  const kept = [];
  let openers = 0;
  for (const raw of text.split(LINE_BREAK)) {
    const line = trimmed(raw, extension);
    const dropped = isDropped(line, prefix);
    if (dropped && openers % 2 === 1) {
      return null;
    }
    if (!dropped) {
      kept.push(line);
      openers += openerCount(line);
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
