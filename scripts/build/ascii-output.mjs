// esbuild's charset "ascii" escapes strings, untagged templates, and identifiers
// but leaves raw non-ASCII in comments, String.raw and tagged template text, and
// regex literals. Escaping the last three would change a runtime value, so this
// pass escapes comments only and fails the build, naming the file and position,
// when a raw character sits anywhere else.
import { parse } from "acorn";

const HAS_NON_ASCII = /[\u0080-\uffff]/;
const EACH_UNIT = /[\u0080-\uffff]/g;
const EACH_CODE_POINT = /[\u0080-\u{10ffff}]/gu;
const HEX_RADIX = 16;
const ESCAPE_DIGITS = 4;

function commentRanges({ text, file }) {
  const ranges = [];
  try {
    parse(text, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowHashBang: true,
      onComment: (_block, _body, start, end) => ranges.push([start, end]),
    });
  } catch (error) {
    throw new Error(`${file}: cannot parse the bundle to locate non-ASCII characters: ${error.message}`, {
      cause: error,
    });
  }
  return ranges;
}

function position({ text, offset }) {
  const before = text.slice(0, offset);
  return { line: before.split("\n").length, column: offset - before.lastIndexOf("\n") };
}

function offendersOutsideComments({ text, file, ranges }) {
  const offenders = [];
  for (const match of text.matchAll(EACH_CODE_POINT)) {
    const offset = match.index;
    const inComment = ranges.some(([start, end]) => offset >= start && offset < end);
    if (!inComment) {
      const { line, column } = position({ text, offset });
      const hex = match[0].codePointAt(0).toString(HEX_RADIX).toUpperCase().padStart(ESCAPE_DIGITS, "0");
      offenders.push(
        `${file}:${line}:${column} U+${hex} is outside a comment (a String.raw or tagged template, or a regex literal); write it as an escape in the source`,
      );
    }
  }
  return offenders;
}

export function toAsciiBundle({ text, file }) {
  if (!HAS_NON_ASCII.test(text)) {
    return text;
  }
  const offenders = offendersOutsideComments({ text, file, ranges: commentRanges({ text, file }) });
  if (offenders.length > 0) {
    throw new Error(offenders.join("\n"));
  }
  return text.replace(
    EACH_UNIT,
    (unit) => `\\u${unit.charCodeAt(0).toString(HEX_RADIX).padStart(ESCAPE_DIGITS, "0")}`,
  );
}
