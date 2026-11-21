#!/usr/bin/env node
// The deterministic steps of the doc-reconcile workflow. AI sessions judge
// pairs and make the edits; this script decides everything that needs no
// judgement and checks what the sessions did.
//
//   prep    --dir=<artifacts> --candidates=<file>     queue the pairs; print the count
//   advance --dir=<artifacts>                         record the judge's reply and queue the
//                                                     next pair; exit 0 once none is left, 1 otherwise
//   plan    --dir=<artifacts> --repo=<root> --claim-age=<script>
//           [--generated=<globs>] [--min-gap=<days>]
//                                                     date CONFLICT and DUPLICATE pairs; print the action count
//   verify  --dir=<artifacts> --repo=<root>           keep only edits inside the planned ranges;
//                                                     print the changed file count
//   report  --dir=<artifacts>                         write and print report.md
//
// Exit 2 on any error.
import { runCli } from "../../archon-shared/scripts/cli.mjs";
import { advance, prep } from "./judging.mjs";
import { plan } from "./planning.mjs";
import { report } from "./reporting.mjs";
import { verify } from "./verifying.mjs";

export { advance, BUDGET, prep, replyProblem, VERDICTS } from "./judging.mjs";
export { globToRegExp, plan, textAt } from "./planning.mjs";
export { report } from "./reporting.mjs";
export { changedFiles, hunks, rangesFit, verify } from "./verifying.mjs";

const KEBAB = /-(\w)/g;

// The steps take camelCase options: --claim-age becomes claimAge.
function camelKeys(args) {
  const entries = Object.entries(args).map(([key, value]) => [
    key.replace(KEBAB, (_, letter) => letter.toUpperCase()),
    value,
  ]);
  return Object.fromEntries(entries);
}

function planCommand(args) {
  const options = camelKeys(args);
  return String(plan({ ...options, minGap: options.minGap ? Number(options.minGap) : 1 }));
}

runCli({
  url: import.meta.url,
  name: "reconcile",
  required: ["dir"],
  commands: {
    prep: (args) => String(prep(camelKeys(args))),
    advance: (args) => ({ out: "", code: advance(camelKeys(args)) ? 0 : 1 }),
    plan: planCommand,
    verify: (args) => String(verify(camelKeys(args))),
    report: (args) => report(camelKeys(args)).trimEnd(),
  },
});
