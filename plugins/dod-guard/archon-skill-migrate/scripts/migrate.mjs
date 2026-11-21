#!/usr/bin/env node
// The deterministic steps of the skill-migrate workflow. Sessions write the
// inventory, contract, classification, replacement body and audit; this
// script turns them into the approval form and the files skill-migrate's own
// gates read, runs those gates, and writes the report. Nothing here writes
// the target.
//
//   verbatim --dir                                   contract.md's Verbatim section to verbatim.txt
//   options  --dir                                   validate cuts.json; print the form
//   approve  --dir --answer=<json>                   write approvals.json and corrections.md
//   leak     --dir --repo --target --commit --pack   scan the writer's inputs against the original;
//            [--strict=true]                         PASS or the leaking files; strict exits 1 on a leak
//   gate     --dir --repo --target --commit --pack   merge, then overlap and regression; PASS or why not
//   final    --dir --repo --target --commit --pack   the gate plus finish-check; exit 1 when a gate fails
//   report   --dir --repo --target                   write and print report.md
//
// Exit 2 on any error.
import process from "node:process";
import { runCli } from "../../archon-shared/scripts/cli.mjs";
import { approve, options, verbatim } from "./form.mjs";
import { final, GateFailure, gate, leak } from "./gates.mjs";
import { report } from "./report.mjs";

export { approve, NONE, options, verbatim } from "./form.mjs";
export { final, GateFailure, gate, leak, merge, WRITER_INPUTS } from "./gates.mjs";
export { report } from "./report.mjs";

// A gate that said no exits 1 with its reason on stderr; any other error
// still reaches runCli and exits 2.
function gated(command) {
  return (args) => {
    try {
      return command(args);
    } catch (error) {
      if (!(error instanceof GateFailure)) {
        throw error;
      }
      process.stderr.write(`skill-migrate: ${error.message}\n`);
      return { out: "", code: 1 };
    }
  };
}

const COMMANDS = {
  verbatim: (args) => verbatim(args),
  options: (args) => JSON.stringify(options(args)),
  approve: (args) => JSON.stringify(approve(args)),
  leak: (args) => leak(args),
  gate: (args) => gate(args),
  final: (args) => final(args),
  report: (args) => report(args).trimEnd(),
};

runCli({
  url: import.meta.url,
  name: "skill-migrate",
  required: ["dir"],
  commands: Object.fromEntries(Object.entries(COMMANDS).map(([name, command]) => [name, gated(command)])),
});
