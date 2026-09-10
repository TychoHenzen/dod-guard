import { dispatch } from "./strip-frame-scan.mjs";

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

function advanceLine(source, cursor) {
  while (cursor.scanned < cursor.index) {
    if (source[cursor.scanned] === "\n") cursor.line += 1;
    cursor.scanned += 1;
  }
}

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
  };
}
