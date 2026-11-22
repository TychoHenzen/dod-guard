#!/usr/bin/env node
// Score a SKILL.md against post-4.6 migration guidelines.
// Each check carries a 0-1 score and a weight; the weighted sum is a
// 0-100 "5.0-readiness" score for comparing two skills.
// Exit codes: 0 all checks pass, 1 at least one fails, 3 usage error or a
// target inside an installed plugin cache (.claude/plugins/).
// With --json, writes structured output. With --before=<path>, loads a
// prior run and prints a before/after comparison.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { loadRun, parseArgs } from "./lib/cli.mjs";
import { runComparison } from "./lib/comparison.mjs";
import { printChecks } from "./lib/report.mjs";
import { findPluginCachePath } from "./plugin-cache-path.mjs";

const USAGE = [
  "Usage: node migration-check.mjs <path-to-file> [options]",
  "",
  "  --json             Output structured JSON (score + checks)",
  "  --save=<path>      Write results to file (for before/after comparison)",
  "  --before=<path>    Load a prior run and compare against it",
  "  --kind=<k>         Override kind detection: skill, agent, claude-md, memory, instinct",
  "  --sha256           Print the sha256 of the file bytes and exit 0 (target integrity check)",
  "",
  "Prints a 0-100 5.0-readiness score (weighted sum of per-check scores).",
  "Refuses a file under .claude/plugins/ (an installed plugin cache): use the source checkout.",
  "Exit codes: 0 pass, 1 at least one check fails, 3 usage error or cache path.",
].join("\n");

// --- Comparison ---

// --- Output ---

// --- CLI ---

function fail(message) {
  process.stderr.write(message);
  return 3;
}

function saveRun(args, target, run) {
  if (!args.save) return;
  const timestamp = new Date().toISOString();
  const data = { file: target, kind: run.kind, score: run.score, checks: run.checks, timestamp };
  writeFileSync(args.save, JSON.stringify(data, null, 2));
}

function printRun(args, run) {
  if (args.json === "true") {
    process.stdout.write(`${JSON.stringify({ score: run.score, checks: run.checks, kind: run.kind }, null, 2)}\n`);
    return;
  }
  printChecks(run.checks, run.score, run.kind);
}

const exitCode = (checks) => (checks.every((c) => c.pass) ? 0 : 1);

const cacheRefusal = (path) =>
  `Refusing ${path}: a path under .claude/plugins/ is an installed plugin cache that /plugin update overwrites. ` +
  "Run the migration on the skill's source checkout (see standards/working-defaults.md).\n";

function printSha256(target) {
  try {
    process.stdout.write(`${createHash("sha256").update(readFileSync(target)).digest("hex")}\n`);
    return 0;
  } catch (err) {
    return fail(`Cannot read ${target}: ${err.message}\n`);
  }
}

function main(argv) {
  const args = parseArgs(argv);
  const target = args.positional[0];
  if (!target) return fail(`${USAGE}\n`);
  const cachePath = findPluginCachePath(target);
  if (cachePath) return fail(cacheRefusal(cachePath));
  if (args.sha256 === "true") return printSha256(target);
  const loaded = loadRun(args, target);
  if (loaded.error) return fail(loaded.error);
  saveRun(args, target, loaded.run);
  if (args.before) return runComparison(args, loaded.run);
  printRun(args, loaded.run);
  return exitCode(loaded.run.checks);
}

process.exit(main(process.argv.slice(2)));
