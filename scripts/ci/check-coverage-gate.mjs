#!/usr/bin/env node
// check-coverage-gate - the coverage-gate ratchet, CI's authority on scenario
// coverage.
//
// Runs `dod-guard cover --all` over the main spec tree, not just active
// changes - see openspec/changes/route-skills-through-openspec/design.md for
// why an already-archived capability's scenarios still have to be watched.
// Fails only on a regression against
// .github/quality/coverage-gate-baseline.json; a scenario the baseline has
// never seen is adopted, not failed.
//
// This runs against the bundle built from this checkout, never a globally
// installed dod-guard.
//
// Usage: node scripts/ci/check-coverage-gate.mjs [--write-baseline]
//
// Exit codes:
//   0  no scenario regressed (or, with --write-baseline, the baseline was written)
//   1  at least one scenario regressed against the baseline
//   3  the bundle is missing, so nothing could be checked

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUNDLE = join(ROOT, "packages", "dod-guard", "dist", "bundle.js");

function main(argv) {
  if (!existsSync(BUNDLE)) {
    process.stderr.write(`ERROR: ${BUNDLE} is missing. Run 'npm run bundle -w packages/dod-guard' first.\n`);
    return 3;
  }

  const args = [BUNDLE, "cover", "--all", `--cwd=${ROOT}`];
  if (argv.includes("--write-baseline")) args.push("--write-baseline");

  const run = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf-8",
  });
  process.stdout.write(run.stdout ?? "");
  process.stderr.write(run.stderr ?? "");
  return run.status ?? 1;
}

process.exit(main(process.argv.slice(2)));
