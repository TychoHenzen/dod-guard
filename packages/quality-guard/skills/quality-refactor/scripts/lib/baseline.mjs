// Ratchet support: compare a scan against a recorded baseline.
//
// Counts are keyed `<file>::<rule>` rather than by line number, so an edit that
// shifts lines is not a regression. The recorded file list matters just as much:
// without it, a file the baseline never saw is indistinguishable from a file
// that was clean, so every newly created file reads as a regression from zero.

import { readFileSync, writeFileSync } from "node:fs";

const BASELINE_VERSION = 2;

function countByFileRule(violations) {
  const counts = {};
  for (const violation of violations) {
    const key = `${violation.file}::${violation.rule}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function splitKey(key) {
  const at = key.lastIndexOf("::");
  return [key.slice(0, at), key.slice(at + 2)];
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function bucketFor(before, now) {
  if (now === before) return null;
  return now > before ? "regressions" : "improvements";
}

export function buildBaseline(violations, profile, scannedFiles) {
  return {
    version: BASELINE_VERSION,
    profile,
    createdAt: new Date().toISOString(),
    total: violations.length,
    files: sortedUnique(scannedFiles),
    counts: countByFileRule(violations),
  };
}

export function writeBaseline(path, baseline) {
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
}

export function readBaseline(path) {
  const baseline = JSON.parse(readFileSync(path, "utf8"));
  if (baseline.version !== BASELINE_VERSION || !Array.isArray(baseline.files)) {
    const found = baseline.version ?? "unknown";
    throw new Error(
      `baseline ${path} is version ${found}, this scanner needs version ${BASELINE_VERSION} with a files list — re-record it with --write-baseline`,
    );
  }
  return baseline;
}

export function compareToBaseline(violations, baseline, scannedFiles) {
  const current = countByFileRule(violations);
  const known = new Set(baseline.files);
  const newFiles = sortedUnique(scannedFiles).filter((file) => !known.has(file));
  const isNew = new Set(newFiles);
  const result = { regressions: [], improvements: [], adopted: [], newFiles };
  for (const key of new Set([...Object.keys(current), ...Object.keys(baseline.counts)])) {
    const [file, rule] = splitKey(key);
    const now = current[key] ?? 0;
    if (isNew.has(file) || !(key in baseline.counts)) {
      if (now > 0) result.adopted.push({ file, rule, now });
      continue;
    }
    const before = baseline.counts[key];
    const bucket = bucketFor(before, now);
    if (bucket) result[bucket].push({ file, rule, before, now });
  }
  return { ...result, totalBefore: baseline.total, totalNow: violations.length };
}

/**
 * Fold the new files' counts into the baseline so the next run holds them to
 * this bar. Additive only: a vanished file keeps its recorded counts until a
 * full `--write-baseline` rewrite drops it.
 */
export function adoptNewFiles(baseline, violations, adopted) {
  const adoptedKeys = new Set(adopted.map((a) => `${a.file}::${a.rule}`));
  const counts = { ...baseline.counts };
  for (const [key, count] of Object.entries(countByFileRule(violations))) {
    if (adoptedKeys.has(key)) counts[key] = count;
  }
  const newFiles = adopted.filter((a) => !new Set(baseline.files).has(a.file)).map((a) => a.file);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { ...baseline, files: sortedUnique([...baseline.files, ...newFiles]), total, counts };
}
