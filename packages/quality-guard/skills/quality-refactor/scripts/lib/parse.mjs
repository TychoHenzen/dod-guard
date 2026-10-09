import {
  braceLanguageFunctions,
  goFunctions,
  rustFunctions,
  tsFunctions,
} from "./parse-functions.mjs";
import { pythonFunctions } from "./parse-python.mjs";

// `source` is the raw text that `code` was stripped from. Only the "ts" path
// reads it, to recognize quoted literals that the stripper blanked.
export function findFunctions(code, lang, starts, source) {
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
