// Ratchet support: compare a scan against a recorded baseline.
//
// Baselines record per-file, per-rule COUNTS rather than line numbers, so an
// unrelated edit that shifts lines does not register as a regression. The only
// thing that counts as a regression is more violations of a rule in a file
// than there were before.

import { readFileSync, writeFileSync } from "node:fs";

function countByFileRule(violations) {
  const counts = {};
  for (const violation of violations) {
    const key = `${violation.file}::${violation.rule}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function buildBaseline(violations, profile) {
  return {
    version: 1,
    profile,
    createdAt: new Date().toISOString(),
    total: violations.length,
    counts: countByFileRule(violations),
  };
}

export function writeBaseline(path, baseline) {
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
}

export function readBaseline(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Compare current counts to the baseline. `regressions` are strictly worse,
 * `improvements` are strictly better. A file that disappeared counts as fixed.
 */
export function compareToBaseline(violations, baseline) {
  const current = countByFileRule(violations);
  const keys = new Set([...Object.keys(current), ...Object.keys(baseline.counts)]);
  const regressions = [];
  const improvements = [];
  for (const key of keys) {
    const [file, rule] = key.split("::");
    const now = current[key] ?? 0;
    const before = baseline.counts[key] ?? 0;
    if (now > before) regressions.push({ file, rule, before, now });
    else if (now < before) improvements.push({ file, rule, before, now });
  }
  return {
    regressions,
    improvements,
    totalBefore: baseline.total,
    totalNow: violations.length,
  };
}
