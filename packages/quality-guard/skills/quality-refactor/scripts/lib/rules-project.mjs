import { lineAt } from "./offsets.mjs";
import { wildcardImportsFor } from "./architecture-imports.mjs";
import { inTestRegion } from "./rules-file-rust-tests.mjs";
import { push } from "./violations.mjs";
import { checkDuplication } from "./rules-duplicate.mjs";
import { checkCommentReferences } from "./rules-project/comment-references.mjs";
import {
  checkEnvironment,
  resolveEntrypoints,
} from "./rules-project/environment.mjs";
import { checkReachability } from "./rules-reachability.mjs";

function checkWildcardImports({ files, scans, config }) {
  const out = [];
  for (const file of files) {
    const scan = scans.get(file.rel);
    // Rust test modules glob-import their parent by convention (use super::*),
    // so a wildcard inside a test region is idiomatic, not an obscured API.
    const testRegions = scan?.testRegions ?? [];
    const matches = wildcardImportsFor(scan?.code ?? "", file.lang).filter(
      (match) => !inTestRegion(testRegions, match.offset),
    );
    for (const match of matches) {
      push({
        out,
        file,
        line: lineAt(scan.starts, match.offset),
        rule: "wildcard-import",
        severity: config.presence["wildcard-import"],
        message:
          `${match.target} wildcard import obscures its imported API; ` +
          "import explicit names instead",
        suggestion: `Import explicit names from ${match.target}.`,
        metric: 1,
      });
    }
  }
  return out;
}

export {
  checkCommentReferences,
  checkDuplication,
  checkEnvironment,
  checkReachability,
  checkWildcardImports,
  resolveEntrypoints,
};
