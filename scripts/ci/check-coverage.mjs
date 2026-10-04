#!/usr/bin/env node
// Report package coverage without comparing or writing a threshold.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const C8_CLI = join(ROOT, "node_modules", "c8", "bin", "c8.js");
const PACKAGES = ["quality-guard", "fossil", "knowledge-base"];
const METRICS = ["statements", "branches", "functions", "lines"];

function c8Args(pkg, reportDir) {
  const dist = `packages/${pkg}/dist`;
  const testDist = `packages/${pkg}/dist-test`;
  return [
    `--include=${testDist}/src/**/*.js`,
    `--exclude=${testDist}/**/*.test.js`,
    `--exclude=${testDist}/src/types.js`,
    `--exclude=${testDist}/src/constants.js`,
    `--exclude=${dist}/bundle.js`,
    "--reporter=json-summary",
    `--report-dir=${reportDir}`,
    "node",
    "--experimental-test-module-mocks",
    "--test",
    `${testDist}/**/*.test.js`,
  ];
}

function measure(pkg, reportDir) {
  execFileSync(process.execPath, [C8_CLI, ...c8Args(pkg, reportDir)], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
  const summary = JSON.parse(readFileSync(join(reportDir, "coverage-summary.json"), "utf8"));
  return Object.fromEntries(METRICS.map((metric) => [metric, summary.total[metric].pct]));
}

export function measureAll() {
  const workDir = mkdtempSync(join(ROOT, ".coverage-advisory-"));
  try {
    return Object.fromEntries(PACKAGES.map((pkg) => [pkg, measure(pkg, join(workDir, pkg))]));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function reportLine(pkg, metrics) {
  return `  ${pkg.padEnd(14)} ${METRICS.map((metric) => `${metric.slice(0, 4)} ${metrics[metric]}%`).join("  ")}`;
}

export function main(argv, dependencies = {}) {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  if (argv.length > 0) {
    stderr.write(`unknown option: ${argv[0]}\nusage: check-coverage.mjs\n`);
    return 3;
  }
  try {
    const current = dependencies.measure ? dependencies.measure() : measureAll();
    for (const [pkg, metrics] of Object.entries(current)) stdout.write(`${reportLine(pkg, metrics)}\n`);
    stdout.write(`coverage advisory — ${Object.keys(current).length} package(s); metrics are report-only\n`);
  } catch (error) {
    stderr.write(`coverage advisory unavailable — ${error instanceof Error ? error.message : String(error)}\n`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
