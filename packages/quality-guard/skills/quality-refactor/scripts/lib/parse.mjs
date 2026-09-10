import {
  braceLanguageFunctions,
  goFunctions,
  rustFunctions,
} from "./parse-functions.mjs";
import { pythonFunctions } from "./parse-python.mjs";

export function findFunctions(code, lang, starts) {
  if (lang === "py") return pythonFunctions(code, starts);
  if (lang === "rs") return rustFunctions(code, starts);
  if (lang === "go") return goFunctions(code, starts);
  return braceLanguageFunctions(code, starts);
}
