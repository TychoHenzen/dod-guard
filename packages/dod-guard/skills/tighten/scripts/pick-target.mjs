#!/usr/bin/env node
// One invocation of the tighten skill handles one target. This prints it.
//
// The exit code is the loop's stop signal. A driver that must read prose to
// learn whether work remains will get it wrong. Exit 4 means the queue is
// empty, so the loop stops calling.

import { resolve } from "node:path";
import { parseArgs } from "../../../lib/args.mjs";
import { changeIdForFile } from "./lib/change-id.mjs";
import { openLedger } from "./lib/ledger-file.mjs";
import { MAX_ATTEMPTS, nextTarget, summarize } from "./lib/ledger.mjs";

const USAGE = [
  "Usage: node pick-target.mjs [--ledger=<path>] [--root=<dir>] [--json]",
  "",
  "Prints the highest ranked target the loop has not finished with.",
  "",
  "Exit codes: 0 target printed, 4 queue empty, 3 no ledger at that path.",
].join("\n");

function describe(entry, counts, changeId) {
  const rules = Object.entries(entry.rules)
    .filter(([, count]) => count > 0)
    .map(([rule, count]) => `${rule}=${count}`)
    .join(" ");
  return [
    `file: ${entry.file}`,
    `change: ${changeId}`,
    `score: ${entry.score.toFixed(1)}`,
    `churn: ${entry.churn.returns} returns, ${entry.churn.fixReturns} fixed`,
    `oracle: ${entry.hasOracle ? "existing tests" : "none, characterize"}`,
    `attempt: ${entry.attempts + 1} of ${MAX_ATTEMPTS}`,
    `rules: ${rules}`,
    `remaining: ${counts.pending}`,
  ].join("\n");
}

function printTarget(entry, counts, json) {
  const changeId = changeIdForFile(entry.file);
  const text = json ? JSON.stringify({ ...entry, changeId }, null, 2) : describe(entry, counts, changeId);
  process.stdout.write(`${text}\n`);
}

function printEmpty(counts) {
  process.stdout.write(`queue empty. accepted: ${counts.accepted}`);
  process.stdout.write(` resistant: ${counts.resistant}\n`);
}

function resolveRoot(args) {
  return resolve(args.root ?? ".");
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
  const entry = nextTarget(ledger, resolveRoot(args));
  const counts = summarize(ledger);
  if (!entry) {
    printEmpty(counts);
    return 4;
  }
  printTarget(entry, counts, args.json);
  return 0;
}

process.exit(main(process.argv.slice(2)));
