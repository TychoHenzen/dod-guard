import { lineIndex } from "./offsets.mjs";
import {
  braceLanguageFunctions,
  goFunctions,
  rustFunctions,
  tsFunctions,
} from "./parse-functions.mjs";
import { pythonFunctions } from "./parse-python.mjs";

const FINDERS = {
  py: pythonFunctions,
  rs: (stripped, starts) => rustFunctions(stripped.code, starts),
  go: (stripped, starts) => goFunctions(stripped.code, starts),
  ts: (stripped, starts, source) =>
    tsFunctions(stripped.code, starts, source),
};

function braceFunctions(stripped, starts) {
  return braceLanguageFunctions(stripped.code, starts);
}

// `stripped` is what `strip(source, lang)` returned for the raw `source`.
// Every language requires the raw text: the ts path reads quoted literals
// from it and the py path reads indentation from it.
export function findFunctions(stripped, lang, source) {
  if (typeof source !== "string") {
    throw new TypeError("findFunctions requires the raw source string");
  }
  const find = FINDERS[lang] ?? braceFunctions;
  return find(stripped, lineIndex(stripped.code), source);
}
