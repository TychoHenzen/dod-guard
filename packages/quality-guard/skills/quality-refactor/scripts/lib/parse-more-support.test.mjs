import { lineIndex } from "./offsets.mjs";
import { findFunctions } from "./parse.mjs";
import { strip } from "./strip.mjs";

export function namesIn(source, lang) {
  const { code } = strip(source, lang);
  return findFunctions(code, lang, lineIndex(code))
    .map((fn) => fn.name)
    .sort();
}
