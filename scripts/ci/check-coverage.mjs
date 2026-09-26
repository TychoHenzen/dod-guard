#!/usr/bin/env node
// check-coverage - ratchet on statement, branch, function and line coverage.
//
// One number for the whole repository lets a well-tested package hide a bare
// one. A uniform threshold has the other failure. It either sits under every
// package or blocks the build the day it lands. This records what each package
// covers today. It fails only when a package drops below its own number.
//
// c8 matches --include against the compiled production files it loads, not
// the TypeScript the report names after source-map remapping. Separate test
// projects load production code from dist-test/src, while the shipped build
// remains in dist. Keep each package's include and test globs paired.
//
// Usage: node scripts/ci/check-coverage.mjs [--write-baseline] [--allow-reviewed-decrease=<path>]
//
// Exit codes:
//   0  no package dropped below its baseline
//   1  a package regressed
//   3  usage error

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const C8_CLI = join(ROOT, "node_modules", "c8", "bin", "c8.js");
const BASELINE = join(ROOT, ".github", "quality", "coverage-baseline.json");
const PACKAGES = ["quality-guard", "fossil", "knowledge-base"];
const TEST_PROJECT_PACKAGES = new Set(["quality-guard", "fossil", "knowledge-base"]);
const METRICS = ["statements", "branches", "functions", "lines"];
const REVIEWED_DECREASE_PREFIX = "--allow-reviewed-decrease=";

// Slack in percentage points covers small platform-dependent differences. A
// drop that matters is worth whole points, so this is no wider than needed.
const TOLERANCE = 0.25;

const NOTE = "Coverage each package holds today. A drop below its own number fails CI.";

function c8Args(pkg, reportDir) {
  const dist = `packages/${pkg}/dist`;
  const testDist = TEST_PROJECT_PACKAGES.has(pkg) ? `packages/${pkg}/dist-test` : dist;
  const coverageDist = TEST_PROJECT_PACKAGES.has(pkg) ? `${testDist}/src` : dist;
  return [
    `--include=${coverageDist}/**/*.js`,
    `--exclude=${testDist}/**/*.test.js`,
    `--exclude=${coverageDist}/types.js`,
    `--exclude=${coverageDist}/constants.js`,
    `--exclude=${dist}/bundle.js`,
    "--reporter=json-summary",
    `--report-dir=${reportDir}`,
    "node",
    "--experimental-test-module-mocks",
    "--test",
    // Recursive, to match --include above. A non-recursive glob leaves a
    // nested test unrun while its source still counts, which reads as a
    // coverage drop that no amount of testing can fix.
    `${testDist}/**/*.test.js`,
  ];
}

/** Run one package's suite under c8 and read the totals it wrote. */
function measure(pkg, reportDir) {
  try {
    execFileSync(process.execPath, [C8_CLI, ...c8Args(pkg, reportDir)], {
      cwd: ROOT,
      encoding: "utf8",
      shell: false,
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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateMetricSet(metrics, source) {
  if (!isRecord(metrics)) {
    throw new Error(`${source} must be an object`);
  }
  const missing = METRICS.filter((metric) => !Object.hasOwn(metrics, metric));
  const extra = Object.keys(metrics).filter((metric) => !METRICS.includes(metric));
  if (missing.length > 0 || extra.length > 0) {
    const problems = [];
    if (missing.length > 0) problems.push(`missing ${missing.join(", ")}`);
    if (extra.length > 0) problems.push(`unexpected ${extra.join(", ")}`);
    throw new Error(`${source} has invalid metrics: ${problems.join("; ")}`);
  }
  for (const metric of METRICS) {
    if (typeof metrics[metric] !== "number" || !Number.isFinite(metrics[metric])) {
      throw new Error(`${source}.${metric} must be a finite number`);
    }
  }
  return metrics;
}

function validatePackages(packages, source) {
  if (!isRecord(packages)) {
    throw new Error(`${source} must be an object`);
  }
  for (const [pkg, metrics] of Object.entries(packages)) {
    validateMetricSet(metrics, `${source}.${pkg}`);
  }
  return packages;
}

function readBaseline(path = BASELINE) {
  if (!existsSync(path)) return {};
  const document = JSON.parse(readFileSync(path, "utf8"));
  if (!(isRecord(document) && Object.hasOwn(document, "packages"))) {
    throw new Error(`${path} must contain a packages object`);
  }
  return validatePackages(document.packages, `${path}.packages`);
}

function writeBaseline(packages, path = BASELINE) {
  validatePackages(packages, "baseline packages");
  writeFileSync(path, `${JSON.stringify({ note: NOTE, packages }, null, 2)}\n`);
}

function parseArgs(argv) {
  const reviewedDecreaseArgs = argv.filter((arg) => arg.startsWith(REVIEWED_DECREASE_PREFIX));
  const unknown = argv.filter((arg) => arg !== "--write-baseline" && !arg.startsWith(REVIEWED_DECREASE_PREFIX));
  if (unknown.length > 0) return { error: `unknown option: ${unknown[0]}` };
  if (reviewedDecreaseArgs.length > 1) return { error: "reviewed decrease evidence may be supplied once" };
  if (reviewedDecreaseArgs.some((arg) => arg === REVIEWED_DECREASE_PREFIX)) {
    return { error: "reviewed decrease evidence path is required" };
  }
  if (reviewedDecreaseArgs.length > 0 && !argv.includes("--write-baseline")) {
    return { error: "reviewed decrease evidence requires --write-baseline" };
  }
  return {
    writeBaseline: argv.includes("--write-baseline"),
    reviewedDecreasePath: reviewedDecreaseArgs[0]?.slice(REVIEWED_DECREASE_PREFIX.length),
  };
}

function evidencePath(path) {
  const resolved = resolve(ROOT, path);
  const relativePath = relative(ROOT, resolved);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || resolve(ROOT, relativePath) !== resolved) {
    throw new Error("reviewed decrease evidence must be inside the repository");
  }
  return resolved;
}

function readReviewedDecreaseEvidence(path) {
  const resolved = evidencePath(path);
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", relative(ROOT, resolved)], {
      cwd: ROOT,
      stdio: "ignore",
    });
  } catch (error) {
    throw new Error("reviewed decrease evidence must be tracked in git", { cause: error });
  }
  return JSON.parse(readFileSync(resolved, "utf8"));
}

function validateReviewedDecreaseEvidence(evidence, drops) {
  if (evidence?.reviewed !== true) throw new Error("reviewed decrease evidence must set reviewed=true");
  if (typeof evidence.reviewer !== "string" || evidence.reviewer.trim() === "") {
    throw new Error("reviewed decrease evidence needs a reviewer");
  }
  const hasReference = [evidence.issue, evidence.pullRequest].some(
    (reference) => Number.isInteger(reference) && reference > 0,
  );
  if (!hasReference) {
    throw new Error("reviewed decrease evidence needs an issue or pull request number");
  }
  if (!Array.isArray(evidence.decreases) || evidence.decreases.length === 0) {
    throw new Error("reviewed decrease evidence needs at least one decrease");
  }

  const actual = new Map(drops.map((drop) => [`${drop.package}:${drop.metric}`, drop]));
  const seen = new Set();
  for (const decrease of evidence.decreases) {
    const key = `${decrease?.package}:${decrease?.metric}`;
    const drop = actual.get(key);
    if (!drop || seen.has(key) || decrease.from !== drop.from || decrease.to !== drop.to) {
      throw new Error(`reviewed decrease evidence does not match ${key}`);
    }
    if (typeof decrease.reason !== "string" || decrease.reason.trim() === "") {
      throw new Error(`reviewed decrease evidence needs a reason for ${key}`);
    }
    seen.add(key);
  }
  if (seen.size !== actual.size) throw new Error("reviewed decrease evidence does not cover every decrease");
  return seen;
}

function mergeBaseline(current, baseline, reviewedDecreaseEvidence = null) {
  validatePackages(current, "current coverage");
  validatePackages(baseline, "stored baseline");
  const packages = Object.fromEntries(Object.entries(baseline).map(([pkg, metrics]) => [pkg, { ...metrics }]));
  const drops = [];

  for (const [pkg, now] of Object.entries(current)) {
    const before = baseline[pkg];
    if (!before) {
      packages[pkg] = Object.fromEntries(METRICS.map((metric) => [metric, now[metric]]));
    } else {
      packages[pkg] = Object.fromEntries(
        METRICS.map((metric) => {
          if (now[metric] < before[metric]) {
            drops.push({ package: pkg, metric, from: before[metric], to: now[metric] });
            return [metric, before[metric]];
          }
          return [metric, now[metric]];
        }),
      );
    }
  }

  let approved = new Set();
  if (drops.length > 0) {
    if (!reviewedDecreaseEvidence) {
      const names = drops.map((drop) => `${drop.package}.${drop.metric}`).join(", ");
      throw new Error(
        `unreviewed baseline decrease for ${names}; supply --allow-reviewed-decrease=<tracked evidence path>`,
      );
    }
    approved = validateReviewedDecreaseEvidence(reviewedDecreaseEvidence, drops);
  } else if (reviewedDecreaseEvidence) {
    approved = validateReviewedDecreaseEvidence(reviewedDecreaseEvidence, drops);
  }
  for (const drop of drops) {
    if (approved.has(`${drop.package}:${drop.metric}`)) packages[drop.package][drop.metric] = drop.to;
  }
  return { packages, drops, approved };
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

function main(argv, dependencies = {}) {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  const options = parseArgs(argv);
  if (options.error) {
    stderr.write(`${options.error}\nusage: check-coverage.mjs [--write-baseline] [--allow-reviewed-decrease=<path>]\n`);
    return 3;
  }

  const measureCoverage = dependencies.measure ?? measureAll;
  const baselinePath = dependencies.baselinePath ?? BASELINE;
  const readEvidence = dependencies.readEvidence ?? readReviewedDecreaseEvidence;
  const current = measureCoverage();
  if (options.writeBaseline) {
    try {
      let reviewedDecreaseEvidence = null;
      if (options.reviewedDecreasePath) {
        reviewedDecreaseEvidence = readEvidence(options.reviewedDecreasePath);
      }
      const result = mergeBaseline(current, readBaseline(baselinePath), reviewedDecreaseEvidence);
      for (const drop of result.drops) {
        const action = result.approved.has(`${drop.package}:${drop.metric}`) ? "reviewed decrease" : "preserved";
        stdout.write(`  ${action}: ${drop.package} ${drop.metric} ${drop.from}% to ${drop.to}%\n`);
      }
      writeBaseline(result.packages, baselinePath);
      stdout.write(`wrote coverage baseline for ${Object.keys(current).length} package(s)\n`);
      return 0;
    } catch (error) {
      stderr.write(`baseline write refused: ${error.message}\n`);
      return 1;
    }
  }

  for (const [pkg, now] of Object.entries(current)) stdout.write(`${reportLine(pkg, now)}\n`);

  const { drops, gains, adopted } = compare(current, readBaseline(baselinePath));
  for (const line of [...adopted, ...gains]) stdout.write(`${line}\n`);

  if (drops.length === 0) {
    stdout.write(`coverage OK - ${Object.keys(current).length} package(s), 0 regression(s)\n`);
    return 0;
  }
  stdout.write(`coverage FAILED - ${drops.length} metric(s) below baseline\n\n`);
  for (const line of drops) stdout.write(`${line}\n`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}

export {
  METRICS,
  main,
  mergeBaseline,
  parseArgs,
  readReviewedDecreaseEvidence,
  validateReviewedDecreaseEvidence,
  writeBaseline,
};
