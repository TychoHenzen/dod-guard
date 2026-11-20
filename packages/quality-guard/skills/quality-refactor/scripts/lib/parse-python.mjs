import { matchBracket } from "./offsets.mjs";
import { splitParams } from "./parse-expressions.mjs";

const DEF = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;
const LEADING_WHITESPACE = /^[ \t]*/;
const TAB = /\t/g;

// Strings and comments are blank, so every bracket counted here is code. A
// stray closer is clamped at zero so it cannot hide every later line.
function bracketDepthAfter(text, depth) {
  let open = depth;
  for (const ch of text) {
    open += Number("([{".includes(ch));
    open = Math.max(0, open - Number(")]}".includes(ch)));
  }
  return open;
}

// Python blocks are made of logical lines. A physical line that begins inside
// an open bracket, after a backslash, or inside a multi-line string continues
// the line above it, so its indentation says nothing about blocks. Each entry
// is the raw indentation of the logical line starting there, or null. The
// indentation comes from the raw source because a line can open with a string,
// and blanking turns that string into what looks like more indentation.
function logicalIndents(lines, source, literalLines) {
  const sourceLines = source.split("\n");
  let depth = 0;
  let joined = false;
  return lines.map((text, index) => {
    const opens = depth === 0 && !joined && !literalLines.has(index + 1);
    depth = bracketDepthAfter(text, depth);
    joined = text.trimEnd().endsWith("\\");
    if (!opens || text.trim() === "") {
      return null;
    }
    return indentOf(sourceLines[index]);
  });
}

// The body runs until the next logical line at or left of the def. A line
// with code, or one inside a string the body opened, extends it; blank and
// comment-only lines do not.
function holdsBodyText(layout, index) {
  const blank = layout.lines[index].trim() === "";
  return !blank || layout.literalLines.has(index + 1);
}

function bodyLastLine(layout, first, baseIndent) {
  const { lines, indents } = layout;
  let last = first;
  for (let j = first + 1; j < lines.length; j += 1) {
    if (indents[j] !== null && indents[j] <= baseIndent) break;
    if (holdsBodyText(layout, j)) last = j;
  }
  return last;
}

function bodyIndents(indents, first, last) {
  return indents
    .slice(first + 1, last + 1)
    .filter((indent) => indent !== null);
}

function headerParams(code, start) {
  const open = code.indexOf("(", start);
  const close = matchBracket(code, open, "()");
  return splitParams(close === -1 ? "" : code.slice(open + 1, close));
}

export function indentOf(line) {
  const match = LEADING_WHITESPACE.exec(line);
  return match[0].replace(TAB, "    ").length;
}

/**
 * `stripped` is the result of `strip()`. Each function carries
 * `logicalIndents`: the def line's indentation, then the indentation of every
 * logical line in its body, which is all the nesting metric needs.
 */
export function pythonFunctions(stripped, starts, source) {
  const { code, literalLines } = stripped;
  const lines = code.split("\n");
  const indents = logicalIndents(lines, source, literalLines);
  const layout = { lines, indents, literalLines };
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = DEF.exec(lines[i]);
    if (!match) continue;
    const baseIndent = indentOf(lines[i]);
    const last = bodyLastLine(layout, i, baseIndent);
    const end =
      last + 1 < starts.length ? starts[last + 1] - 1 : code.length - 1;
    found.push({
      name: match[1],
      line: i + 1,
      params: headerParams(code, starts[i]),
      headerStart: starts[i],
      start: starts[i],
      end,
      body: code.slice(starts[i], end + 1),
      logicalIndents: [baseIndent, ...bodyIndents(indents, i, last)],
    });
  }
  return found;
}
