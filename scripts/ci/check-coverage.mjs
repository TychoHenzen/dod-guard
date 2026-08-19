#!/usr/bin/env node
// check-coverage - ratchet on statement, branch, function and line coverage.
//
// One number for the whole repository lets a well-tested package hide a bare
// one. A uniform threshold has the other failure. It either sits under every
// package or blocks the build the day it lands. This records what each package
// covers today. It fails only when a package drops below its own number.
//
// c8 matches --include against the files it loads. Those are the compiled
// dist/*.js, not the src/*.ts the report names after remapping through the
// source map. An include written against src matches nothing at all. c8
// enforces no threshold when nothing matches. Keep these globs on dist.
//
// Usage: node scripts/ci/check-coverage.mjs [--write-baseline]
//
// Exit codes:
//   0  no package dropped below its baseline
//   1  a package regressed
//   3  usage error

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = join(ROOT, ".github", "quality", "coverage-baseline.json");
const PACKAGES = ["dod-guard", "quality-guard"];
const METRICS = ["statements", "branches", "functions", "lines"];

// Slack in percentage points. dod-guard drives a real server over stdio, and a
// run where one of those exits slower reports a hair less. A drop that matters
// is worth whole points, so this is wide enough for timing and no wider.
const TOLERANCE = 0.25;

const NOTE = "Coverage each package holds today. A drop below its own number fails CI.";

function c8Args(pkg, reportDir) {
  const dist = `packages/${pkg}/dist`;
  return [
    "c8",
    `--include=${dist}/**/*.js`,
    `--exclude=${dist}/**/*.test.js`,
    `--exclude=${dist}/types.js`,
    `--exclude=${dist}/constants.js`,
    `--exclude=${dist}/bundle.js`,
    "--reporter=json-summary",
    `--report-dir=${reportDir}`,
    "node",
    "--experimental-test-module-mocks",
    "--test",
    // Recursive, to match --include above. A non-recursive glob leaves a
    // nested test unrun while its source still counts, which reads as a
    // coverage drop that no amount of testing can fix.
    `${dist}/**/*.test.js`,
  ];
}

/** Run one package's suite under c8 and read the totals it wrote. */
function measure(pkg, reportDir) {
  try {
    execFileSync("npx", c8Args(pkg, reportDir), {
      cwd: ROOT,
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
      // Default 1MB is too small for a full suite's TAP output on a real
      // failure - a truncated buffer would report ENOBUFS instead of the
      // actual test failure.
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    const tail = (s) => (s ?? "").toString().trim().split("\n").slice(-40).join("\n");
    throw new Error(
      `${pkg}'s suite failed under c8 (exit ${err.status}):\n--- stdout (tail) ---\n${tail(err.stdout)}\n--- stderr (tail) ---\n${tail(err.stderr)}`,
    );
  }
  const summary = JSON.parse(readFileSync(join(reportDir, "coverage-summary.json"), "utf8"));
  return Object.fromEntries(METRICS.map((m) => [m, summary.total[m].pct]));
}

function measureAll() {
  const workDir = mkdtempSync(join(tmpdir(), "dod-guard-coverage-"));
  try {
    return Object.fromEntries(PACKAGES.map((pkg) => [pkg, measure(pkg, join(workDir, pkg))]));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function readBaseline() {
  if (!existsSync(BASELINE)) return {};
  return JSON.parse(readFileSync(BASELINE, "utf8")).packages ?? {};
}

function writeBaseline(current) {
  writeFileSync(BASELINE, `${JSON.stringify({ note: NOTE, packages: current }, null, 2)}\n`);
}

/** Every metric a package lost ground on, against the numbers it had before. */
function dropsFor(pkg, before, now) {
  return METRICS.filter((m) => now[m] + TOLERANCE < before[m]).map(
    (m) => `  ${pkg} ${m}: ${before[m]}% before, ${now[m]}% now`,
  );
}

function gainsFor(pkg, before, now) {
  return METRICS.filter((m) => now[m] > before[m] + TOLERANCE).map(
    (m) => `  improved: ${pkg} ${m} ${before[m]}% to ${now[m]}% - rerun with --write-baseline`,
  );
}

function compare(current, baseline) {
  const drops = [];
  const gains = [];
  const adopted = [];
  for (const [pkg, now] of Object.entries(current)) {
    const before = baseline[pkg];
    if (!before) {
      adopted.push(`  adopted: ${pkg} at ${now.statements}% statements`);
      continue;
    }
    drops.push(...dropsFor(pkg, before, now));
    gains.push(...gainsFor(pkg, before, now));
  }
  return { drops, gains, adopted };
}

function reportLine(pkg, now) {
  const parts = METRICS.map((m) => `${m.slice(0, 4)} ${now[m]}%`);
  return `  ${pkg.padEnd(14)} ${parts.join("  ")}`;
}

function main(argv) {
  const unknown = argv.filter((a) => a !== "--write-baseline");
  if (unknown.length > 0) {
    process.stderr.write(`unknown option: ${unknown[0]}\nusage: check-coverage.mjs [--write-baseline]\n`);
    return 3;
  }

  const current = measureAll();
  if (argv.includes("--write-baseline")) {
    writeBaseline(current);
    process.stdout.write(`wrote coverage baseline for ${Object.keys(current).length} package(s)\n`);
    return 0;
  }

  for (const [pkg, now] of Object.entries(current)) process.stdout.write(`${reportLine(pkg, now)}\n`);

  const { drops, gains, adopted } = compare(current, readBaseline());
  for (const line of [...adopted, ...gains]) process.stdout.write(`${line}\n`);

  if (drops.length === 0) {
    process.stdout.write(`coverage OK - ${Object.keys(current).length} package(s), 0 regression(s)\n`);
    return 0;
  }
  process.stdout.write(`coverage FAILED - ${drops.length} metric(s) below baseline\n\n`);
  for (const line of drops) process.stdout.write(`${line}\n`);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
