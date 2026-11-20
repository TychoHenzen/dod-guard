import { findFunctions } from "../../../../../skills/quality-refactor/scripts/lib/parse.mjs";
import { strip } from "../../../../../skills/quality-refactor/scripts/lib/strip.mjs";

export function namesIn(source, lang) {
  return findFunctions(strip(source, lang), lang, source)
    .map((fn) => fn.name)
    .sort();
}
