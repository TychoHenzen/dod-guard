#!/usr/bin/env node
// The deterministic steps of the codex-migrate workflow. A proposal session
// writes slices.json; this script turns it into the approval form, verifies
// each slice a session applies, commits it or reverts it, and writes the
// report. The scanner and the agent converter are the codex-migrate skill's
// own scripts, found from this script's location.
//
//   options --dir=<artifacts> --repo=<root>      validate slices.json; print the form
//   approve --dir --repo --answer=<json>         record the answer, queue the first slice
//   advance --dir --repo                         verify the applied slice, commit or revert
//                                                it, queue the next; exit 0 once none is left
//   report  --dir=<artifacts>                    write and print report.md
//
// Exit 2 on any error.
import { runCli } from "../../archon-shared/scripts/cli.mjs";
import { KINDS, NONE, options } from "./form.mjs";
import { report } from "./report.mjs";
import { counts, signalProblem } from "./signals.mjs";
import { advance, approve, MAX_SLICES } from "./slices.mjs";
import { scan } from "./verify.mjs";

export { advance, approve, counts, KINDS, MAX_SLICES, NONE, options, report, scan, signalProblem };

runCli({
  url: import.meta.url,
  name: "migrate",
  required: ["dir"],
  commands: {
    options: (args) => JSON.stringify(options(args)),
    approve: (args) => JSON.stringify(approve(args)),
    advance: (args) => ({ out: "", code: advance(args) ? 0 : 1 }),
    report: (args) => report(args).trimEnd(),
  },
});
