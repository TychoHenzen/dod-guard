import { lineIndex } from "./offsets.mjs";
import { findTypes } from "./parse-types.mjs";
import { findFunctions } from "./parse.mjs";
import { checkComments } from "./rules-comments.mjs";
import { classSpans } from "./rules-file-spans.mjs";
import { checkFunction } from "./rules-file-state.mjs";
import { checkTypes } from "./rules-file-checks.mjs";
import { checkTuples } from "./rules-file-tuples.mjs";
import { checkLines } from "./rules-file-line-check.mjs";
import { findRustTestRegions, inTestRegion } from "./rules-file-rust-tests.mjs";
import { strip } from "./strip.mjs";

export { inTestRegion };

export function scanFile(file, config) {
  const { code, comments, interpolations } = strip(file.source, file.lang);
  const starts = lineIndex(code);
  const functions = findFunctions(code, file.lang, starts);
  const types = findTypes(code, file.lang, starts);
  const spans = file.lang === "py" ? [] : classSpans(code, types, file.lang);
  const testRegions = file.lang === "rs" ? findRustTestRegions(code) : [];
  const out = [];

  checkLines(file, config, out);
  checkTypes({ file, config, types, out });
  checkTuples({ file, config, code, starts, out });
  checkComments({ file, config, comments, codeLines: code.split("\n"), out });
  const context = { starts, spans, code, interpolations };
  for (const fn of functions) {
    if (inTestRegion(testRegions, fn.headerStart)) continue;
    checkFunction({ file, config, fn, context, out });
  }

  return {
    violations: out,
    code,
    starts,
    functions,
    types,
    testRegions,
    interpolations,
  };
}
