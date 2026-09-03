#!/usr/bin/env node
// quality-scan — zero-dependency structural quality scanner.
//
// Exit codes are a contract (they are used as step verify_cmds):
//   0  gate passed
//   1  gate failed
//   3  usage error
//
// Run `node quality-scan.mjs --help` for options.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ALL_RULES, buildConfig } from "./lib/config.mjs";
import { adoptNewFiles, buildBaseline, compareToBaseline, readBaseline, writeBaseline } from "./lib/baseline.mjs";
import { renderJson, renderText, sortViolations, summarize, toWorkUnits } from "./lib/report.mjs";
import { scanFile } from "./lib/rules-file.mjs";
import { checkDuplication, checkReachability } from "./lib/rules-project.mjs";
import { collectManifests } from "./lib/manifests.mjs";
import { collectFiles, loadFiles } from "./lib/walk.mjs";

const USAGE = `quality-scan [paths...] [options]

  --format=text|json|units   text (default), raw violations, or per-file work units
  --profile=default|strict   strict promotes every "preferably" bound to a hard bound
  --rules=a,b,c              only run these rules (default: all)
  --exclude=<fragment>       skip paths containing this fragment (repeatable)
  --test-path=<fragment>     treat paths containing this fragment as test code (repeatable)
  --root=<dir>               anchor for relative paths (default: cwd)
  --top=N                    text mode: show N worst files (default 15)
  --write-baseline=<path>    record the current scan as the ratchet baseline
  --baseline=<path>          compare against a baseline; files the baseline has
                             never seen are recorded into it, not failed
  --fail-on=none|error|regression|any   what makes this exit 1 (default: none)

Rules: ${ALL_RULES.join(", ")}`;

/** Flag name -> how to fold its value into the options object. */
const FLAG_HANDLERS = {
  format: (options, value) => {
    options.format = value;
  },
  profile: (options, value) => {
    options.profile = value;
  },
  rules: (options, value) => {
    options.rules = value.split(",").filter(Boolean);
  },
  exclude: (options, value) => options.excludes.push(value),
  "test-path": (options, value) => options.testPaths.push(value),
  root: (options, value) => {
    options.root = resolve(value);
  },
  top: (options, value) => {
    options.top = Number.parseInt(value, 10) || 15;
  },
  "write-baseline": (options, value) => {
    options.writeBaseline = value;
  },
  baseline: (options, value) => {
    options.baseline = value;
  },
  "fail-on": (options, value) => {
    options.failOn = value;
  },
};

function defaultOptions() {
  return {
    paths: [],
    format: "text",
    profile: "default",
    rules: null,
    excludes: [],
    testPaths: [],
    root: process.cwd(),
    top: 15,
    writeBaseline: null,
    baseline: null,
    failOn: "none",
  };
}

function parseArgs(argv) {
  const options = defaultOptions();
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      options.paths.push(arg);
      continue;
    }
    const [flag, value = ""] = arg.slice(2).split(/=(.*)/s);
    if (flag === "help") return { help: true };
    const handler = FLAG_HANDLERS[flag];
    if (!handler) return { error: `unknown option: --${flag}` };
    handler(options, value);
  }
  if (options.paths.length === 0) options.paths.push(".");
  return options;
}

function validate(options) {
  if (!["text", "json", "units"].includes(options.format)) return `bad --format: ${options.format}`;
  if (!["default", "strict"].includes(options.profile)) return `bad --profile: ${options.profile}`;
  if (!["none", "error", "regression", "any"].includes(options.failOn)) return `bad --fail-on: ${options.failOn}`;
  const unknown = (options.rules ?? []).filter((rule) => !ALL_RULES.includes(rule));
  if (unknown.length > 0) return `unknown rules: ${unknown.join(", ")}`;
  if (options.baseline && !existsSync(options.baseline)) return `baseline not found: ${options.baseline}`;
  return null;
}

function scan(options, config) {
  const targets = options.paths.map((p) => resolve(options.root, p));
  const files = loadFiles(collectFiles(targets, options.root, options.excludes), options.testPaths);
  // Manifests are collected from the scan root, not from targets. A scene or
  // project file that connects a target's symbols routinely sits above the
  // scanned subdirectory. For example, RootScene.tscn sits at the repo root
  // while the target is Scripts/. Scoping this collection to targets would
  // miss exactly the case it exists to catch.
  const manifests = collectManifests(options.root, options.excludes);
  const scans = new Map();
  let violations = [];
  for (const file of files) {
    const result = scanFile(file, config);
    scans.set(file.rel, result);
    violations = violations.concat(result.violations);
  }
  violations = violations.concat(checkReachability(files, scans, config, manifests));
  violations = violations.concat(checkDuplication(files, config));
  if (options.rules) violations = violations.filter((v) => options.rules.includes(v.rule));
  return { files, violations };
}

function gateFailed(failOn, summary, comparison) {
  if (failOn === "any") return summary.total > 0;
  if (failOn === "error") return summary.errors > 0;
  if (failOn === "regression") return comparison !== null && comparison.regressions.length > 0;
  return false;
}

/**
 * Compare against the baseline and fold any file the baseline has never seen
 * into it, so a file's first appearance records a bar instead of failing the
 * gate against a phantom zero. Returns null if the baseline is unreadable.
 */
function compareAndAdopt(path, violations, scanned) {
  let baseline;
  try {
    baseline = readBaseline(path);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return null;
  }
  const comparison = compareToBaseline(violations, baseline, scanned);
  if (comparison.adopted.length > 0) {
    writeBaseline(path, adoptNewFiles(baseline, violations, comparison.adopted));
  }
  return comparison;
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const problem = options.error ?? validate(options);
  if (problem) {
    process.stderr.write(`${problem}\n\n${USAGE}\n`);
    return 3;
  }

  const config = buildConfig(options.profile);
  const { files, violations } = scan(options, config);
  const scanned = files.map((file) => file.rel);
  const sorted = sortViolations(violations);
  const summary = summarize(sorted);

  const comparison = options.baseline ? compareAndAdopt(options.baseline, sorted, scanned) : null;
  if (options.baseline && comparison === null) return 3;

  if (options.writeBaseline) writeBaseline(options.writeBaseline, buildBaseline(sorted, options.profile, scanned));

  const result = {
    profile: options.profile,
    fileCount: files.length,
    files: files
      .map((file) => ({
        path: file.rel,
        language: file.lang,
        classification: file.isTest ? "test" : "production",
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
    summary,
    comparison,
    violations: sorted,
  };
  if (options.format === "json") process.stdout.write(`${renderJson(result)}\n`);
  else if (options.format === "units") {
    process.stdout.write(`${renderJson({ ...result, units: toWorkUnits(sorted) })}\n`);
  } else process.stdout.write(`${renderText(result, options.top)}\n`);

  return gateFailed(options.failOn, summary, comparison) ? 1 : 0;
}

process.exitCode = main(process.argv.slice(2));
