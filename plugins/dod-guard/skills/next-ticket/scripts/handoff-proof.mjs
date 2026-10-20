#!/usr/bin/env node
// Runs the structured-handoff convergence proof over an issue body.
//
// Usage: node handoff-proof.mjs refinement --body-file=<path> [--children=<path>]
//        node handoff-proof.mjs post-push --body-file=<path> --handoff-file=<path>
//          --head-sha=<sha> [--children=<path>]
//        node handoff-proof.mjs finalization --body-file=<path> --handoff-file=<path>
//          --head-sha=<sha> [--children=<path>]
//
// refinement reads the records of a body saved to a local file, plus the
// linked functional-slice children from an optional JSON array file, and runs
// the pre-push proof, including the lens-row rules on the planned acceptance
// matrix. post-push reads the same body and the acceptance matrix of the
// implementation handoff saved to a local file, and checks every row and every
// review lens against the pushed head SHA, so a row or lens bound to another
// head is reported. finalization is the same proof plus the complete-pr gate's
// own head check; complete-pr runs it before it readies or merges. No subcommand
// makes a network or GitHub call; fetching the issue and the handoff belongs to
// the caller. Each prints one JSON object
// {outcome, remainder} and exits:
//   0  verified
//   1  actionable remainder
//   2  usage or parse error (a handoff with no readable matrix is a parse error)
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { optionsFrom, readChildren, readText, UsageError } from "./handoff-proof-cli.mjs";
import { PROOFS } from "./handoff-proof-runs.mjs";

const EXIT_CODES = Object.freeze({ verified: 0, "actionable remainder": 1 });

function evaluate(argv) {
  const { subcommand, options } = optionsFrom(argv);
  const body = readText(options["body-file"], "body-file");
  const children = readChildren(options.children);
  let handoff = "";
  if (subcommand !== "refinement") {
    handoff = readText(options["handoff-file"], "handoff-file");
  }
  return PROOFS[subcommand]({ body, handoff, headSha: options["head-sha"], children });
}

function main(argv) {
  let result;
  try {
    result = evaluate(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    result = { outcome: "usage error", remainder: [error.message] };
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return EXIT_CODES[result.outcome] ?? 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
