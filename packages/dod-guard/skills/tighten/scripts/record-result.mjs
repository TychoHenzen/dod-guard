#!/usr/bin/env node
// Closes one cycle. Every cycle ends here, the failed ones included.
//
// An attempt the ledger never hears about is an attempt the loop repeats on the
// next invocation, with no memory that it already failed. That is the one bug
// that turns this loop into an infinite one.

import { parseArgs } from "../../../lib/args.mjs";
import { openLedger, writeLedgerFile } from "./lib/ledger-file.mjs";
import { recordResult } from "./lib/ledger.mjs";

// No status for "we decided not to try". Every picked target gets a rewrite,
// so a target only ever leaves the queue on a measured result.
const STATUSES = ["accepted", "resistant", "pending"];

const USAGE = [
  "Usage: node record-result.mjs --file=<path> --status=<status> [options]",
  "",
  `  --status=<s>      one of ${STATUSES.join(", ")}`,
  "  --reason=<text>   why, required for resistant",
  "  --commit=<sha>    the commit that holds the accepted rewrite",
  "  --after=<score>   tangle score the simplicity gate measured after",
  "  --ledger=<path>   ledger file (default .tighten/ledger.json)",
  "",
  "Exit codes: 0 recorded, 3 usage error.",
].join("\n");

function buildResult(args) {
  const result = { status: args.status, reason: args.reason ?? null };
  if (args.commit) {
    result.commit = args.commit;
  }
  if (args.after !== undefined) {
    result.after = { score: Number(args.after) };
  }
  return result;
}

function invalid(args) {
  if (!args?.file || !STATUSES.includes(args.status)) {
    return "file and a known status are required";
  }
  if (args.status === "resistant" && !args.reason) {
    return "--reason is required for resistant";
  }
  return null;
}

function main(argv) {
  const args = parseArgs(argv);
  const problem = invalid(args);
  if (problem) {
    process.stderr.write(`${problem}\n${USAGE}\n`);
    return 3;
  }
  const { path, ledger } = openLedger(args);
  if (!ledger) {
    process.stderr.write(`no ledger at ${path}\n`);
    return 3;
  }
  try {
    writeLedgerFile(path, recordResult(ledger, args.file, buildResult(args)));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 3;
  }
  process.stdout.write(`recorded ${args.file} as ${args.status}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
