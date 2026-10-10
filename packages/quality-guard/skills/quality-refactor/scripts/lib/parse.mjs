import {
  braceLanguageFunctions,
  goFunctions,
  rustFunctions,
  tsFunctions,
} from "./parse-functions.mjs";
import { pythonFunctions } from "./parse-python.mjs";

// `source` is the raw text that `code` was stripped from. Every language requires
// it, because the ts path reads quoted literals from it.
export function findFunctions(code, lang, starts, source) {
  if (typeof source !== "string") {
    throw new TypeError("findFunctions requires the raw source string");
  }
  if (lang === "py") {
    return pythonFunctions(code, starts);
  }
  if (lang === "rs") {
    return rustFunctions(code, starts);
  }
  if (lang === "go") {
    return goFunctions(code, starts);
  }
  if (lang === "ts") {
    return tsFunctions(code, starts, source);
  }
  return braceLanguageFunctions(code, starts);
}
