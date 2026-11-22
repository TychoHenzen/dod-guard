import { findFunctions } from "#quality-guard-parse";
import { strip } from "#quality-guard-strip";

export function namesIn(source, lang) {
  return findFunctions(strip(source, lang), lang, source)
    .map((fn) => fn.name)
    .sort();
}
