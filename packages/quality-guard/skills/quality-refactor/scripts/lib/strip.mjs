import { dispatch } from "./strip-frame-scan.mjs";

function createState(source, lang) {
  return {
    source,
    lang,
    cursor: { index: 0, line: 1, scanned: 0 },
    parts: [],
    comments: [],
    interpolations: [],
    literalLines: new Set(),
    previous: { char: "\n", word: "" },
    stack: [{ kind: "code" }],
  };
}

function advanceLine(source, cursor) {
  while (cursor.scanned < cursor.index) {
    if (source[cursor.scanned] === "\n") cursor.line += 1;
    cursor.scanned += 1;
  }
}

/**
 * `literalLines` holds the 1-based numbers of the lines that begin inside a
 * string, comment or template literal opened on an earlier line. Blanking
 * hides that: such a line looks like code with extra indentation.
 */
export function strip(source, lang) {
  const state = createState(source, lang);
  while (state.cursor.index < state.source.length) {
    advanceLine(state.source, state.cursor);
    dispatch(state);
  }
  return {
    code: state.parts.join(""),
    comments: state.comments,
    interpolations: state.interpolations,
    literalLines: state.literalLines,
  };
}
