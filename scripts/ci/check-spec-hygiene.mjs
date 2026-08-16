#!/usr/bin/env node
// check-spec-hygiene — flag compound requirements in OpenSpec specs.
//
// A requirement is compound when its obligation-keyword count exceeds its
// scenario count: more SHALL/MUST/... clauses than scenarios verifying them.
// The counting lives in lib/obligation-count.mjs. This file walks
// openspec/specs/**/spec.md, warns on every compound requirement, and prints
// a summary line.
//
// Usage: node scripts/ci/check-spec-hygiene.mjs [--strict] [--root=<dir>]
//
// --root exists so the test suite can point the scan at a fixture tree
// instead of the repository. It is resolved as the repo root, and specs are
// read from <root>/openspec/specs.
//
// Exit codes:
//   0  no compound requirements, or warning mode (no --strict)
//   1  compound requirements found and --strict was passed

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toPosix, walkFiles } from "./lib/fs-utils.mjs";
import { analyzeSpec } from "./lib/obligation-count.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function specId(specsRoot, specFilePath) {
  const posix = toPosix(specsRoot, specFilePath);
  return posix.replace(/\/spec\.md$/, "");
}

function scanSpecs(specsRoot) {
  const specFiles = walkFiles(specsRoot)
    .filter((file) => file.endsWith("spec.md"))
    .sort();

  let totalRequirements = 0;
  let compoundCount = 0;
  let uncoveredTotal = 0;

  for (const specFile of specFiles) {
    const id = specId(specsRoot, specFile);
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
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const rootArg = args.find((arg) => arg.startsWith("--root="));
  const repoRoot = rootArg ? resolve(rootArg.slice("--root=".length)) : REPO_ROOT;
  const specsRoot = resolve(repoRoot, "openspec", "specs");

  const { totalRequirements, compoundCount, uncoveredTotal } = scanSpecs(specsRoot);
  process.stdout.write(
    `${totalRequirements} requirements, ${compoundCount} compound, ${uncoveredTotal} uncovered obligations\n`,
  );
  return strict && compoundCount > 0 ? 1 : 0;
}

process.exitCode = main();
