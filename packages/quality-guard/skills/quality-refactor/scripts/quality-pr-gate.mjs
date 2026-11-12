#!/usr/bin/env node
// Pull-request gate: only findings the pull request introduces can block it.
// The files it changes are scanned at the merge base and at HEAD; a medium/high
// finding that exists only at HEAD blocks, and the pull request must also
// remove a few findings that were already there (a quota), so quality improves
// without one pull request fixing everything. The whole checkout is scanned at
// the merge base and at HEAD. The excludePaths of the merge-base
// .quality-guard.json apply to both scans, so a pull request cannot exclude its
// own findings.
// Usage: node quality-pr-gate.mjs --base=<ref> [--exclude=<fragment>]...
//          [--block-on=low|medium|high] [--rule-block-on=<rule>:<severity>]...
//          [--fix-medium-high=<n>] [--fix-low=<n>]
//          [--report=<file>] [--comment=<file>] [--report-link=<url>]
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./lib/pr-gate-args.mjs";
import { classifyChanges } from "./lib/pr-gate-compare.mjs";
import { evaluateGate } from "./lib/pr-gate-evaluate.mjs";
import {
  reportToConsole,
  summarize,
  writeOutputs,
} from "./lib/pr-gate-output.mjs";
import {
  changedFiles,
  scanMergeBase,
  scanViolations,
} from "./lib/pr-gate-scan.mjs";

function runGate(options, cwd, { out, err }) {
  const files = changedFiles(options.base, cwd);
  if (files.length === 0) {
    out.write("quality-pr-gate: no changed files\n");
    return 0;
  }
  const base = scanMergeBase(options, cwd);
  const head = scanViolations(cwd, base.excludes);
  if (head.fileCount === 0) {
    err.write(
      "quality-pr-gate: the scan covered no files. Check excludePaths in " +
        ".quality-guard.json and that the checkout holds source files.\n",
    );
    return 2;
  }
  const classified = classifyChanges({
    files,
    head: head.violations,
    base: base.violations,
    excludes: base.excludes,
  });
  const gate = evaluateGate(classified, options);
  writeOutputs(options, summarize({ gate, classified, files, base }));
  reportToConsole(gate, err, out);
  return gate.passed ? 0 : 1;
}

function main(
  argv,
  { cwd = process.cwd(), out = process.stdout, err = process.stderr } = {},
) {
  const options = parseArgs(argv);
  if (options.error) {
    err.write(`quality-pr-gate: ${options.error}\n`);
    return 2;
  }
  try {
    return runGate(options, cwd, { out, err });
  } catch (error) {
    err.write(
      "quality-pr-gate: " +
        `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
