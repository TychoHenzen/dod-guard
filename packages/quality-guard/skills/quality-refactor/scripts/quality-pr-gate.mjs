#!/usr/bin/env node
// Pull-request gate: fails when a file the pull request changes has a high-severity quality finding.
// Usage: node quality-pr-gate.mjs --base=<ref> --root=<dir> [--root=<dir>]... [--exclude=<fragment>]...
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCAN = fileURLToPath(new URL("./quality-scan.mjs", import.meta.url));
// The scanner's --exclude does not remove generated output, so the gate filters these paths itself.
export const GENERATED_PATHS = ["/dist/", "/dist-test/", "/node_modules/"];

export function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isGenerated(path, excludes = GENERATED_PATHS) {
  const normalized = `/${normalizePath(path)}`;
  return excludes.some((fragment) => normalized.includes(fragment));
}

export function blockingViolations(violations, changedFiles, excludes = GENERATED_PATHS) {
  const changed = new Set(changedFiles.map(normalizePath));
  return violations.filter(
    (violation) =>
      violation.severity === "high" &&
      changed.has(normalizePath(violation.file)) &&
      !isGenerated(violation.file, excludes),
  );
}

export function parseArgs(argv) {
  const options = { base: undefined, roots: [], excludes: [...GENERATED_PATHS], error: undefined };
  for (const arg of argv) {
    if (arg.startsWith("--base=")) options.base = arg.slice("--base=".length);
    else if (arg.startsWith("--root=")) options.roots.push(arg.slice("--root=".length));
    else if (arg.startsWith("--exclude=")) options.excludes.push(arg.slice("--exclude=".length));
    else options.error = `unknown argument: ${arg}`;
  }
  if (!options.error && !options.base) options.error = "--base=<ref> is required";
  if (!options.error && options.roots.length === 0) options.error = "at least one --root=<dir> is required";
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
  return git(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`], cwd)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function scanViolations(options, cwd) {
  const args = [
    SCAN,
    ...options.roots,
    "--format=json",
    `--root=${cwd}`,
    ...options.excludes.map((fragment) => `--exclude=${fragment}`),
  ];
  const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`quality-scan failed: ${result.error?.message ?? result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout).violations ?? [];
}

function main(argv, { cwd = process.cwd(), out = process.stdout, err = process.stderr } = {}) {
  const options = parseArgs(argv);
  if (options.error) {
    err.write(`quality-pr-gate: ${options.error}\n`);
    return 2;
  }
  try {
    const changed = changedFiles(options.base, cwd);
    if (changed.length === 0) {
      out.write("quality-pr-gate: no changed files\n");
      return 0;
    }
    const blocking = blockingViolations(scanViolations(options, cwd), changed, options.excludes);
    if (blocking.length === 0) {
      out.write(`quality-pr-gate: ${changed.length} changed files, no high-severity findings\n`);
      return 0;
    }
    for (const violation of blocking) {
      err.write(`${violation.file}:${violation.line} ${violation.rule}: ${violation.message}\n`);
    }
    err.write(`quality-pr-gate: ${blocking.length} high-severity finding(s) in changed files\n`);
    return 1;
  } catch (error) {
    err.write(`quality-pr-gate: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
