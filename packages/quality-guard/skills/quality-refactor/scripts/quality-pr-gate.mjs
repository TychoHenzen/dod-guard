#!/usr/bin/env node
// Pull-request gate: only findings the pull request introduces can block it. The files it changes are scanned at the
// merge base and at HEAD; a medium/high finding that exists only at HEAD blocks, and the pull request must also remove
// a few findings that were already there (a quota), so quality improves without one pull request fixing everything.
// The whole checkout is scanned at the merge base and at HEAD. The excludePaths of the merge-base .quality-guard.json
// apply to both scans, so a pull request cannot exclude its own findings.
// Usage: node quality-pr-gate.mjs --base=<ref> [--exclude=<fragment>]...
//          [--block-on=low|medium|high] [--rule-block-on=<rule>:<severity>]... [--fix-medium-high=<n>] [--fix-low=<n>]
//          [--report=<file>] [--comment=<file>] [--report-link=<url>]
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { classifyChanges, severityRank } from "./lib/pr-gate-compare.mjs";
import { CONFIG_FILE, loadExcludePaths } from "./lib/exclusion-config.mjs";
import { exportTree } from "./lib/merge-base-tree.mjs";
import { evaluateGate } from "./lib/pr-gate-evaluate.mjs";
import { GENERATED_PATHS, isGenerated, parseNameStatus } from "./lib/pr-gate-paths.mjs";
import { quotaText } from "./lib/pr-gate-quota.mjs";
import { renderComment, renderReport } from "./lib/pr-gate-report.mjs";

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
  "--root=": (options) => {
    options.error =
      "--root was removed: the gate scans the whole checkout. " +
      "List code that is not yours under excludePaths in .quality-guard.json";
  },
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
    excludes: [...GENERATED_PATHS],
    ruleBlockOn: {},
    error: undefined,
    ...DEFAULTS,
  };
  for (const arg of argv) applyArg(options, arg);
  validateOptions(options);
  return options;
}

function validateOptions(options) {
  if (options.error) return;
  if (!options.base) {
    options.error = "--base=<ref> is required";
    return;
  }
  if (!isSeverity(options.blockOn)) options.error = "--block-on must be low, medium or high";
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

function spawnFailure(result) {
  if (result.error) return result.error.message;
  return result.status === 0 ? undefined : result.stderr.trim();
}

function scanViolations(dir, excludes) {
  const args = [SCAN, ".", "--format=json", `--root=${dir}`, "--no-config", ...excludes.map((x) => `--exclude=${x}`)];
  const result = spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  const failure = spawnFailure(result);
  if (failure !== undefined) throw new Error(`quality-scan failed: ${failure}`);
  return summarizeScan(JSON.parse(result.stdout));
}

function summarizeScan(parsed) {
  return {
    violations: parsed.violations ?? [],
    fileCount: parsed.fileCount ?? 0,
  };
}

// The merge base is exported to a private directory, with no git worktree, so
// the scan sees exactly the upstream files. Its .quality-guard.json is the only
// setting that counts, so a pull request cannot change its own exclusions.
function scanMergeBase(options, cwd) {
  const mergeBase = git(["merge-base", options.base, "HEAD"], cwd).trim();
  const { dir, cleanup } = exportTree(cwd, mergeBase);
  try {
    const excludes = [...options.excludes, ...loadExcludePaths(dir)];
    const { violations } = scanViolations(dir, excludes);
    return { mergeBase, excludes, violations };
  } finally {
    cleanup();
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
      "quality-pr-gate: the scan covered no files. Check excludePaths in .quality-guard.json " +
        "and that the checkout holds source files.\n",
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

function summarize({ gate, classified, files, base }) {
  return {
    gate,
    classified,
    mergeBase: base.mergeBase.slice(0, 7),
    changedCount: files.length,
    skipped: files.filter((file) => isGenerated(file.path, base.excludes)).map((file) => file.path),
    settingChanged: files.some((file) => file.path === CONFIG_FILE || file.basePath === CONFIG_FILE),
  };
}

function main(argv, { cwd = process.cwd(), out = process.stdout, err = process.stderr } = {}) {
  const options = parseArgs(argv);
  if (options.error) {
    err.write(`quality-pr-gate: ${options.error}\n`);
    return 2;
  }
  try {
    return runGate(options, cwd, { out, err });
  } catch (error) {
    err.write(`quality-pr-gate: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
