import { matchBracket } from "./offsets.mjs";
import { splitParams } from "./parse-expressions.mjs";
import { indentOf, logicalIndents } from "./parse-python-lines.mjs";

const DEF = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/;

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
