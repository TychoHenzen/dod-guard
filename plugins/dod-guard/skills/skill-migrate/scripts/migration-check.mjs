#!/usr/bin/env node
// Score a SKILL.md against post-4.6 migration guidelines.
// Each check carries a 0-1 score and a weight; the weighted sum is a
// 0-100 "5.0-readiness" score for comparing two skills.
// Exit codes: 0 all checks pass, 1 at least one fails, 3 usage error.
// With --json, writes structured output. With --before=<path>, loads a
// prior run and prints a before/after comparison.

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { parseArgs, resolveKind } from "./lib/cli.mjs";
import { runComparison } from "./lib/comparison.mjs";
import { KINDS } from "./lib/kind-tables.mjs";
import { printChecks } from "./lib/report.mjs";
import { runChecks } from "./lib/run-checks.mjs";
import { overallScore } from "./lib/scoring.mjs";

const USAGE = [
  "Usage: node migration-check.mjs <path-to-file> [options]",
  "",
  "  --json             Output structured JSON (score + checks)",
  "  --save=<path>      Write results to file (for before/after comparison)",
  "  --before=<path>    Load a prior run and compare against it",
  "  --kind=<k>         Override kind detection: skill, agent, claude-md, memory, instinct",
  "",
  "Prints a 0-100 5.0-readiness score (weighted sum of per-check scores).",
  "Exit codes: 0 pass, 1 at least one check fails, 3 usage error.",
].join("\n");

// --- Comparison ---

// --- Output ---

// --- CLI ---

function main(argv) {
  const args = parseArgs(argv);
  const target = args.positional[0];
  if (!target) {
    process.stderr.write(`${USAGE}\n`);
    return 3;
  }

  let text;
  try {
    text = readFileSync(target, "utf8");
  } catch (err) {
    process.stderr.write(`Cannot read ${target}: ${err.message}\n`);
    return 3;
  }
  const kind = resolveKind(args, target, text);
  if (!kind) {
    process.stderr.write(`Unknown --kind: ${args.kind}. Expected one of: ${Object.keys(KINDS).join(", ")}\n`);
    return 3;
  }
  const checks = runChecks(text, kind);
  const score = overallScore(checks);

  if (args.save) {
    const data = { file: target, kind, score, checks, timestamp: new Date().toISOString() };
    writeFileSync(args.save, JSON.stringify(data, null, 2));
  }

  if (args.before) return runComparison(args, checks, score, kind);

  if (args.json === "true") {
    process.stdout.write(`${JSON.stringify({ score, checks, kind }, null, 2)}\n`);
  } else {
    printChecks(checks, score, kind);
  }
  return checks.every((c) => c.pass) ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
