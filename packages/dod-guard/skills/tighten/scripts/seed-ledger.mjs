#!/usr/bin/env node
// Seed step. Builds the work queue the tighten loop eats, one target per run.
//
// Structural violations alone rank badly: they put the hardest code first, and
// hard code is often complex for a good reason. Joining them against git churn
// separates the two. Complexity the work keeps returning to is the accidental
// kind, and that is what this loop exists to remove.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LOG_ARGS, parseChurn } from "./lib/churn.mjs";
import { parseArgs } from "../../../lib/args.mjs";
import { openLedger, writeLedgerFile } from "./lib/ledger-file.mjs";
import { buildLedger, mergeLedger, summarize } from "./lib/ledger.mjs";
import { hasOracle } from "./lib/oracle.mjs";
import { rankCandidates } from "./lib/rank.mjs";

const USAGE = [
  "Usage: node seed-ledger.mjs --units=<path|-> [options]",
  "",
  "  --units=<path>    quality-scan --format=units output, or - for stdin",
  "  --ledger=<path>   ledger file (default .tighten/ledger.json)",
  "  --since=<when>    git log window (default '6 months ago')",
  "  --root=<dir>      repository root the unit paths are relative to",
  "",
  "Merges into an existing ledger. A reseed keeps what the loop already tried.",
  "Exit codes: 0 written, 3 usage error.",
].join("\n");

const DEFAULT_SINCE = "6 months ago";

function readUnits(source) {
  const handle = source === "-" ? 0 : source;
  return JSON.parse(readFileSync(handle, "utf8")).units ?? [];
}

function readChurn(root, since) {
  const result = spawnSync("git", [...LOG_ARGS, `--since=${since}`], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git log failed: ${result.stderr?.trim() ?? result.error}`);
  }
  return parseChurn(result.stdout);
}

function toCandidates(units, churn, root) {
  const exists = (path) => existsSync(resolve(root, path));
  return units.map((unit) => ({
    file: unit.file,
    rules: unit.rules ?? {},
    churn: churn[unit.file] ?? { returns: 0, fixReturns: 0 },
    hasOracle: hasOracle(unit.file, exists),
  }));
}

function buildOrMerge(previous, ranked, meta) {
  if (previous) {
    return mergeLedger({ ...previous, ...meta }, ranked);
  }
  return buildLedger(ranked, meta);
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args?.units) {
    process.stderr.write(`${USAGE}\n`);
    return 3;
  }
  const root = resolve(args.root ?? ".");
  const since = args.since ?? DEFAULT_SINCE;
  const { path, ledger: previous } = openLedger(args);
  const churn = readChurn(root, since);
  const units = readUnits(args.units);
  const ranked = rankCandidates(toCandidates(units, churn, root));
  const meta = { since, seeded: new Date().toISOString() };
  const ledger = buildOrMerge(previous, ranked, meta);
  writeLedgerFile(path, ledger);
  const counts = summarize(ledger);
  process.stdout.write(`ledger: ${path}\n`);
  process.stdout.write(`targets: ${ledger.entries.length}\n`);
  process.stdout.write(`pending: ${counts.pending}`);
  process.stdout.write(` accepted: ${counts.accepted}`);
  process.stdout.write(` resistant: ${counts.resistant}\n`);
  return 0;
}

process.exit(main(process.argv.slice(2)));
