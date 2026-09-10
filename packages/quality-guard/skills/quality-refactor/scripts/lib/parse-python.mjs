import { matchBracket } from "./offsets.mjs";
import { splitParams } from "./parse-expressions.mjs";

function indentOf(line) {
  const match = /^[ \t]*/.exec(line);
  return match[0].replace(/\t/g, "    ").length;
}

function bodyLastLine(lines, first, baseIndent) {
  let last = first;
  for (let j = first + 1; j < lines.length; j += 1) {
    if (lines[j].trim() === "") continue;
    if (indentOf(lines[j]) <= baseIndent) break;
    last = j;
  }
  return last;
}

export function pythonFunctions(code, starts) {
  const lines = code.split("\n");
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(lines[i]);
    if (!match) continue;
    const baseIndent = indentOf(lines[i]);
    const last = bodyLastLine(lines, i, baseIndent);
    const openParen = code.indexOf("(", starts[i]);
    const closeParen = matchBracket(code, openParen, "()");
    const end =
      last + 1 < starts.length ? starts[last + 1] - 1 : code.length - 1;
    found.push({
      name: match[1],
      line: i + 1,
      params: splitParams(
        closeParen === -1 ? "" : code.slice(openParen + 1, closeParen),
      ),
      headerStart: starts[i],
      start: starts[i],
      end,
      body: code.slice(starts[i], end + 1),
      indentBased: true,
      baseIndent,
    });
  }
  return found;
}
