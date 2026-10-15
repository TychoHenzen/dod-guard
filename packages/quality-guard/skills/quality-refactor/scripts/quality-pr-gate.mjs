#!/usr/bin/env node
// Pull-request gate: only findings the pull request introduces can block it. The files it changes are scanned at the
// merge base and at HEAD; a medium/high finding that exists only at HEAD blocks, and the pull request must also remove
// a few findings that were already there (a quota), so quality improves without one pull request fixing everything.
// Usage: node quality-pr-gate.mjs --base=<ref> --root=<dir> [--root=<dir>]... [--exclude=<fragment>]...
//          [--block-on=low|medium|high] [--rule-block-on=<rule>:<severity>]... [--fix-medium-high=<n>] [--fix-low=<n>]
//          [--report=<file>] [--comment=<file>] [--report-link=<url>]
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { classifyChanges, severityRank } from "./lib/pr-gate-compare.mjs";
import { evaluateGate } from "./lib/pr-gate-evaluate.mjs";
import { GENERATED_PATHS, baseRoots, parseNameStatus } from "./lib/pr-gate-paths.mjs";
import { quotaText, renderComment, renderReport } from "./lib/pr-gate-report.mjs";

const SCAN = fileURLToPath(new URL("./quality-scan.mjs", import.meta.url));
const DEFAULTS = { blockOn: "medium", fixMediumHigh: 1, fixLow: 3 };

function isSeverity(value) {
  try {
    return severityRank(value) > 0;
  } catch {
    return false;
  }
}

function setRuleBlockOn(options, value) {
  const [rule, severity, ...rest] = value.split(":");
  if (!rule || rest.length > 0 || !isSeverity(severity)) {
    options.error = "--rule-block-on must look like <rule>:<low|medium|high>";
    return;
  }
  options.ruleBlockOn[rule] = severity;
}

const text = (key) => (options, value) => {
  options[key] = value;
};

const count = (flag, key) => (options, value) => {
  if (!/^\d+$/.test(value)) {
    options.error = `${flag}<n> needs a whole number`;
    return;
  }
  options[key] = Number(value);
};

const FLAGS = {
  "--base=": text("base"),
  "--root=": (options, value) => options.roots.push(value),
  "--exclude=": (options, value) => options.excludes.push(value),
  "--block-on=": text("blockOn"),
  "--rule-block-on=": setRuleBlockOn,
  "--fix-medium-high=": count("--fix-medium-high=", "fixMediumHigh"),
  "--fix-low=": count("--fix-low=", "fixLow"),
  "--report=": text("report"),
  "--comment=": text("comment"),
  "--report-link=": text("reportLink"),
};

function applyArg(options, arg) {
  const prefix = Object.keys(FLAGS).find((flag) => arg.startsWith(flag));
  if (prefix === undefined) {
    options.error = `unknown argument: ${arg}`;
    return;
  }
  FLAGS[prefix](options, arg.slice(prefix.length));
}

export function parseArgs(argv) {
  const options = {
    base: undefined,
    roots: [],
    excludes: [...GENERATED_PATHS],
    ruleBlockOn: {},
    error: undefined,
    ...DEFAULTS,
  };
  for (const arg of argv) applyArg(options, arg);
  if (!options.error && !options.base) options.error = "--base=<ref> is required";
  if (!options.error && options.roots.length === 0) options.error = "at least one --root=<dir> is required";
  if (!options.error && !isSeverity(options.blockOn)) options.error = "--block-on must be low, medium or high";
  return options;
}

function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.error?.message ?? result.stderr.trim()}`);
  }
  return result.stdout;
}

function changedFiles(base, cwd) {
  // Deleted files are included so removing a file that carried findings pays down the cleanup quota.
  const output = git(["diff", "--name-status", "-M", "--diff-filter=ACDMR", `${base}...HEAD`], cwd);
  return parseNameStatus(output);
}

function scanViolations(options, dir, wanted = options.roots) {
  const roots = wanted.filter((root) => existsSync(join(dir, root)));
  if (roots.length === 0) return [];
  const args = [SCAN, ...roots, "--format=json", `--root=${dir}`, ...options.excludes.map((x) => `--exclude=${x}`)];
  const result = spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`quality-scan failed: ${result.error?.message ?? result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout).violations ?? [];
}

// The merge base is checked out in a throwaway detached worktree so the scan sees exactly the upstream files.
function scanMergeBase(options, files, cwd) {
  const mergeBase = git(["merge-base", options.base, "HEAD"], cwd).trim();
  const dir = mkdtempSync(join(tmpdir(), "quality-pr-gate-base-"));
  git(["worktree", "add", "--detach", dir, mergeBase], cwd);
  try {
    const roots = baseRoots(options.roots, files, (root) => existsSync(join(dir, root)));
    return { mergeBase, violations: scanViolations(options, dir, roots) };
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", dir], { cwd, encoding: "utf8" });
  }
}

function writeOutputs(options, summary) {
  if (options.report) writeFileSync(options.report, renderReport(summary));
  if (options.comment) writeFileSync(options.comment, renderComment({ ...summary, link: options.reportLink }));
}

function reportToConsole(gate, err, out) {
  for (const finding of gate.blocking) {
    err.write(`${finding.file}:${finding.line} ${finding.rule}: ${finding.message}\n`);
  }
  if (gate.blocking.length > 0) {
    err.write(`quality-pr-gate: ${gate.blocking.length} new finding(s) block this pull request\n`);
  }
  if (!gate.quota.satisfied) err.write(`quality-pr-gate: ${quotaText(gate.quota)}\n`);
  if (gate.passed) out.write(`quality-pr-gate: no new blocking findings. ${quotaText(gate.quota)}\n`);
}

function main(argv, { cwd = process.cwd(), out = process.stdout, err = process.stderr } = {}) {
  const options = parseArgs(argv);
  if (options.error) {
    err.write(`quality-pr-gate: ${options.error}\n`);
    return 2;
  }
  try {
    const files = changedFiles(options.base, cwd);
    if (files.length === 0) {
      out.write("quality-pr-gate: no changed files\n");
      return 0;
    }
    const base = scanMergeBase(options, files, cwd);
    const head = scanViolations(options, cwd);
    const classified = classifyChanges({ files, head, base: base.violations, excludes: options.excludes });
    const gate = evaluateGate(classified, options);
    writeOutputs(options, { gate, classified, mergeBase: base.mergeBase.slice(0, 7), changedCount: files.length });
    reportToConsole(gate, err, out);
    return gate.passed ? 0 : 1;
  } catch (error) {
    err.write(`quality-pr-gate: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
