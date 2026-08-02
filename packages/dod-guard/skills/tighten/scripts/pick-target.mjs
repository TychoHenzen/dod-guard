#!/usr/bin/env node
// One invocation of the tighten skill handles one target. This prints it.
//
// The exit code is the loop's stop signal. A driver that must read prose to
// learn whether work remains will get it wrong. Exit 4 means the queue is
// empty, so the loop stops calling.

import { parseArgs } from "../../../lib/args.mjs";
import { openLedger } from "./lib/ledger-file.mjs";
import { MAX_ATTEMPTS, nextTarget, summarize } from "./lib/ledger.mjs";

const USAGE = [
  "Usage: node pick-target.mjs [--ledger=<path>] [--root=<dir>] [--json]",
  "",
  "Prints the highest ranked target the loop has not finished with.",
  "",
  "Exit codes: 0 target printed, 4 queue empty, 3 no ledger at that path.",
].join("\n");

function describe(entry, counts) {
  const rules = Object.entries(entry.rules)
    .filter(([, count]) => count > 0)
    .map(([rule, count]) => `${rule}=${count}`)
    .join(" ");
  return [
    `file: ${entry.file}`,
    `score: ${entry.score.toFixed(1)}`,
    `churn: ${entry.churn.returns} returns, ${entry.churn.fixReturns} fixed`,
    `oracle: ${entry.hasOracle ? "existing tests" : "none, characterize"}`,
    `attempt: ${entry.attempts + 1} of ${MAX_ATTEMPTS}`,
    `rules: ${rules}`,
    `remaining: ${counts.pending}`,
  ].join("\n");
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args) {
    process.stderr.write(`${USAGE}\n`);
    return 3;
  }
  const { path, ledger } = openLedger(args);
  if (!ledger) {
    process.stderr.write(`no ledger at ${path}. Run seed-ledger.mjs first.\n`);
    return 3;
  }
  const entry = nextTarget(ledger);
  const counts = summarize(ledger);
  if (!entry) {
    process.stdout.write(`queue empty. accepted: ${counts.accepted}`);
    process.stdout.write(` resistant: ${counts.resistant}\n`);
    return 4;
  }
  const json = () => JSON.stringify(entry, null, 2);
  const text = args.json ? json() : describe(entry, counts);
  process.stdout.write(`${text}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
