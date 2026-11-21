#!/usr/bin/env node
// The deterministic steps of the skill-debug workflow. Facts about past runs
// come only from skill-debug's own find-runs.mjs and extract-run.mjs; this
// script chooses which runs to pull, checks every finding cites a step that
// exists, and verifies and commits each accepted edit.
//
//   target  --dir --repo --skill=<name>                  find the skill's SKILL.md in the checkout
//   gather  --dir --skill --days --runs --scripts=<dir>  pull traces into the artifacts
//   options --dir --repo                                 validate findings.json; print the form
//   approve --dir --repo --answer=<json>                 record the answer, queue the first finding
//   advance --dir --repo                                 verify the edit, commit or revert it, queue
//                                                        the next; exit 0 once none is left
//   report  --dir                                        write and print the pull request body
//
// Exit 2 on any error.
import { runCli } from "../../archon-shared/scripts/cli.mjs";
import { advance, approve } from "./edits.mjs";
import { options } from "./findings.mjs";
import { gather, target } from "./gather.mjs";
import { report } from "./report.mjs";

export { bareName, NONE } from "./common.mjs";
export { advance, approve } from "./edits.mjs";
export { CAUSES, options } from "./findings.mjs";
export { gather, indexRows, target } from "./gather.mjs";
export { report } from "./report.mjs";

runCli({
  url: import.meta.url,
  name: "debug",
  required: ["dir"],
  commands: {
    target: (args) => target(args),
    gather: (args) => gather(args),
    options: (args) => JSON.stringify(options(args)),
    approve: (args) => JSON.stringify(approve(args)),
    advance: (args) => ({ out: "", code: advance(args) ? 0 : 1 }),
    report: (args) => report(args).trimEnd(),
  },
});
