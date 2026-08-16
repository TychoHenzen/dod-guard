#!/usr/bin/env node
// check-spec-hygiene — flag compound requirements in OpenSpec specs.
//
// A requirement is compound when its obligation-keyword count exceeds its
// scenario count: more SHALL/MUST/... clauses than scenarios verifying them.
// The counting lives in lib/obligation-count.mjs. This file walks
// openspec/specs/**/spec.md, warns on every compound requirement, and prints
// a summary line.
//
// Usage: node scripts/ci/check-spec-hygiene.mjs [--strict]
//
// Exit codes:
//   0  no compound requirements, or warning mode (no --strict)
//   1  compound requirements found and --strict was passed

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSpec } from "./lib/obligation-count.mjs";
import { toPosix, walkFiles } from "./lib/fs-utils.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPECS_ROOT = resolve(REPO_ROOT, "openspec", "specs");

function specId(specFilePath) {
  const posix = toPosix(SPECS_ROOT, specFilePath);
  return posix.replace(/\/spec\.md$/, "");
}

function scanSpecs() {
  const specFiles = walkFiles(SPECS_ROOT)
    .filter((file) => file.endsWith("spec.md"))
    .sort();

  let totalRequirements = 0;
  let compoundCount = 0;
  let uncoveredTotal = 0;

  for (const specFile of specFiles) {
    const id = specId(specFile);
    for (const req of analyzeSpec(specFile)) {
      totalRequirements += 1;
      if (req.delta <= 0) continue;
      compoundCount += 1;
      uncoveredTotal += req.delta;
      process.stdout.write(
        `WARN: ${id} :: ${req.requirementTitle} - ${req.obligationCount} obligations, ${req.scenarioCount} scenarios\n`,
      );
    }
  }

  return { totalRequirements, compoundCount, uncoveredTotal };
}

function main() {
  const strict = process.argv.includes("--strict");
  const { totalRequirements, compoundCount, uncoveredTotal } = scanSpecs();
  process.stdout.write(`${totalRequirements} requirements, ${compoundCount} compound, ${uncoveredTotal} uncovered obligations\n`);
  return strict && compoundCount > 0 ? 1 : 0;
}

process.exitCode = main();
