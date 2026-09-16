import { lineIndex } from "../../../../../skills/quality-refactor/scripts/lib/offsets.mjs";
import { findFunctions } from "../../../../../skills/quality-refactor/scripts/lib/parse.mjs";
import { strip } from "../../../../../skills/quality-refactor/scripts/lib/strip.mjs";

export function namesIn(source, lang) {
  const { code } = strip(source, lang);
  return findFunctions(code, lang, lineIndex(code))
    .map((fn) => fn.name)
    .sort();
}
