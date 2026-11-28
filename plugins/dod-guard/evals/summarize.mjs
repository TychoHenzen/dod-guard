#!/usr/bin/env node
// summarize - turn `claude plugin eval --json` result files into one Markdown table.
//
// Usage: node plugins/dod-guard/evals/summarize.mjs <result.json>... > RESULTS.md
//
// A case that appears in several files keeps its result from the last file named,
// so a rerun of a few cases can be listed after the full run it replaces.
//
// Exit codes:
//   0  table written
//   3  usage error

import { readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DECIMALS = 2;
const EXIT_OK = 0;
const EXIT_USAGE = 3;
const NOT_AVAILABLE = "n/a";

function score(value) {
  if (typeof value !== "number") {
    return NOT_AVAILABLE;
  }
  return value.toFixed(DECIMALS);
}

function signed(value) {
  if (typeof value !== "number") {
    return NOT_AVAILABLE;
  }
  if (value > 0) {
    return `+${value.toFixed(DECIMALS)}`;
  }
  return value.toFixed(DECIMALS);
}

// A with-only grader has no result in the baseline arm, so its baseline rate is n/a, not 0.
function passRate(runs, graderName) {
  const results = runs.map((run) => run.graders.find((g) => g.name === graderName)).filter(Boolean);
  if (results.length === 0) {
    return NOT_AVAILABLE;
  }
  return `${results.filter((g) => g.passed).length}/${results.length}`;
}

function main(paths) {
  if (paths.length === 0) {
    process.stderr.write("usage: summarize.mjs <result.json>...\n");
    return EXIT_USAGE;
  }
  const results = paths.map((path) => JSON.parse(readFileSync(path, "utf8")));
  process.stdout.write(summarize(results));
  return EXIT_OK;
}

// Function declarations are hoisted, so the entry point can run before the exports below.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}

export function mergeCases(results) {
  const byName = new Map();
  for (const result of results) {
    for (const evalCase of result.cases) {
      byName.set(evalCase.name, evalCase);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function caseRow(evalCase) {
  const withRuns = evalCase.arms.with ?? [];
  const withoutRuns = evalCase.arms.without ?? [];
  const graderNames = [...new Set(withRuns.flatMap((run) => run.graders.map((g) => g.name)))];
  const graders = graderNames
    .map((name) => `${name} ${passRate(withRuns, name)} (baseline ${passRate(withoutRuns, name)})`)
    .join("; ");
  const { aggregates } = evalCase;
  return `| ${evalCase.name} | ${score(aggregates.score)} | ${score(aggregates.scoreWithout)} | ${signed(aggregates.delta)} | ${graders} |`;
}

export function summarize(results) {
  const cases = mergeCases(results);
  const versions = [...new Set(results.map((r) => r.claudeVersion))].join(", ");
  const models = [...new Set(results.map((r) => r.suite?.modelOverride ?? "session default"))].join(", ");
  const [started] = results.map((r) => r.startedAt).sort();
  const cost = results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  return [
    "# Skill trigger eval results",
    "",
    `Claude Code ${versions}, model ${models}, first run started ${started}, ${results.length} result file(s), $${cost.toFixed(DECIMALS)} in total.`,
    "",
    "| Case | With plugin | Baseline | Delta | Graders: passing runs with plugin (baseline) |",
    "|---|---|---|---|---|",
    ...cases.map(caseRow),
    "",
  ].join("\n");
}
