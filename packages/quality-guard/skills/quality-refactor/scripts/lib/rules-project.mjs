import { lineAt } from "./offsets.mjs";
import { wildcardImportsFor } from "./architecture-imports.mjs";
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
    for (const match of wildcardImportsFor(scan?.code ?? "", file.lang))
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
