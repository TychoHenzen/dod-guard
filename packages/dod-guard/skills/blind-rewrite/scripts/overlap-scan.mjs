#!/usr/bin/env node
// Blind-rewrite gate: does the new implementation actually differ from the one
// it replaced? The orchestrator restores the original from git and runs this.
// The writer agent never sees either side of the comparison.

import { readFileSync } from "node:fs";
import { resolveOptions } from "./lib/contract-file.mjs";
import { resolveScorer } from "./lib/score-mode.mjs";

const USAGE = [
  "Usage: node overlap-scan.mjs --original=<paths> --rewrite=<paths>",
  "  [--mode=code|prose] [--whitelist=a,b,c] [--contract-file=<path>]",
  "  [--ngram-size=4] [--json]",
  "",
  "--mode=code (default) scores declarations/lines; prose scores sentences",
  "and their order instead, for rewrites with no test harness.",
  "Paths are comma separated. Whitelist holds contract-boundary names that are",
  "expected to be identical: exported symbols, error strings, serialized keys.",
  "--contract-file holds one required-verbatim contract string per line (text",
  "a client reads word for word, so matching it is not evidence of copying).",
  "Blank/#-comment lines are skipped; every contract string is stripped from",
  "both sides, longest first, before any metric runs.",
  "Exit codes: 0 rewritten, 1 cosmetic, 3 usage error.",
].join("\n");

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(item);
    if (!match) return null;
    args[match[1]] = match[2] ?? "true";
  }
  return args;
}

function readAll(paths) {
  return paths
    .split(",")
    .filter(Boolean)
    .map((path) => readFileSync(path.trim(), "utf8"))
    .join("\n");
}

function formatMetric(result, key) {
  const value = result.metrics[key];
  const rate = key === "run" ? String(value) : value.toFixed(3);
  const limit = result.thresholds[key];
  const sample = result.samples[key];
  const mark = result.breached.includes(key) ? "BREACH" : "ok";
  return `${key}: ${rate} (limit ${limit}, sample ${sample}) ${mark}`;
}

function report(result, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  for (const key of Object.keys(result.metrics)) {
    process.stdout.write(`${formatMetric(result, key)}\n`);
  }
  process.stdout.write(`verdict: ${result.verdict}\n`);
}

function scorerFor(args) {
  if (!args?.original || !args?.rewrite) return null;
  return resolveScorer(args.mode ?? "code");
}

function loadOptions(args) {
  try {
    return { options: resolveOptions(args) };
  } catch (err) {
    return { error: `Cannot read contract file: ${err.message}` };
  }
}

function resolveInputs(args) {
  const scorer = scorerFor(args);
  if (!scorer) return { error: USAGE };
  const loaded = loadOptions(args);
  if (loaded.error) return loaded;
  return { scorer, options: loaded.options };
}

function main(argv) {
  const args = parseArgs(argv);
  const inputs = resolveInputs(args);
  if (inputs.error) {
    process.stderr.write(`${inputs.error}\n`);
    return 3;
  }
  const original = readAll(args.original);
  const rewrite = readAll(args.rewrite);
  const result = inputs.scorer(original, rewrite, inputs.options);
  report(result, Boolean(args.json));
  return result.verdict === "cosmetic" ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
