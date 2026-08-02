#!/usr/bin/env node
// The second gate. The overlap gate proves the rewrite is not a paraphrase.
// This one proves it is smaller.
//
// Without it the loop accepts a rewrite that traded one tangle for a different
// tangle of the same size. That passes every test, passes the overlap gate, and
// leaves the codebase exactly where it started.
//
// Feed it two quality-scan runs in --format=units: one over the quarantined
// original, one over what replaced it.

import { readFileSync } from "node:fs";
import { parseArgs } from "../../../lib/args.mjs";
import { aggregate, judgeSimplicity } from "./lib/simplicity.mjs";

const USAGE = [
  "Usage: node simplicity-gate.mjs --before=<units.json> --after=<units.json>",
  "                                [--min-gain=0.0] [--json]",
  "",
  "Both files are quality-scan --format=units output. --before covers the",
  "quarantined original. --after covers every file that replaced it.",
  "",
  "Exit codes: 0 simpler, 1 not simpler, 3 usage error.",
].join("\n");

function readScan(path) {
  return aggregate(JSON.parse(readFileSync(path, "utf8")));
}

function report(result) {
  const gain = `${(result.gain * 100).toFixed(1)}%`;
  process.stdout.write(`tangle: ${result.before} -> ${result.after}\n`);
  process.stdout.write(`gain: ${gain}\n`);
  for (const item of result.regressions) {
    const detail = `${item.before} -> ${item.after}`;
    process.stdout.write(`regression: ${item.rule} ${detail}\n`);
  }
  process.stdout.write(`verdict: ${result.verdict}\n`);
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args?.before || !args?.after) {
    process.stderr.write(`${USAGE}\n`);
    return 3;
  }
  const options = { minGain: Number(args["min-gain"] ?? 0) };
  const before = readScan(args.before);
  const result = judgeSimplicity(before, readScan(args.after), options);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    report(result);
  }
  return result.verdict === "simpler" ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
