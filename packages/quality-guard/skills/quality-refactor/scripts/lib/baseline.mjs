import { readFileSync, writeFileSync } from "node:fs";
import { countByFileRule, sortedUnique } from "./baseline-counts.mjs";
const BASELINE_VERSION = 2;
function splitKey(key) {
  const at = key.lastIndexOf("::");
  return [key.slice(0, at), key.slice(at + 2)];
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
      `baseline ${path} is version ${found}, this scanner needs version ` +
        `${BASELINE_VERSION} with a files list — re-record it with ` +
        "--write-baseline",
    );
  }
  return baseline;
}

function recordAdopted({ file, rule, now, isNew, result }) {
  if (!isNew.has(file)) return false;
  if (now > 0) result.adopted.push({ file, rule, now });
  return true;
}

function compareKnown({ key, file, rule, now, baseline, result }) {
  const before = baseline.counts[key] ?? 0;
  const bucket = bucketFor(before, now);
  if (bucket) result[bucket].push({ file, rule, before, now });
}

function compareKey({ key, current, baseline, isNew, result }) {
  const [file, rule] = splitKey(key);
  const now = current[key] ?? 0;
  if (recordAdopted({ file, rule, now, isNew, result })) return;
  compareKnown({ key, file, rule, now, baseline, result });
}

export function compareToBaseline(violations, baseline, scannedFiles) {
  const current = countByFileRule(violations);
  const known = new Set(baseline.files);
  const newFiles = sortedUnique(scannedFiles).filter(
    (file) => !known.has(file),
  );
  const isNew = new Set(newFiles);
  const result = { regressions: [], improvements: [], adopted: [], newFiles };
  for (const key of new Set([
    ...Object.keys(current),
    ...Object.keys(baseline.counts),
  ])) {
    compareKey({ key, current, baseline, isNew, result });
  }
  return {
    ...result,
    totalBefore: baseline.total,
    totalNow: violations.length,
  };
}

export function adoptNewFiles(baseline, violations, adopted) {
  const adoptedKeys = new Set(adopted.map((a) => `${a.file}::${a.rule}`));
  const counts = { ...baseline.counts };
  for (const [key, count] of Object.entries(countByFileRule(violations))) {
    if (adoptedKeys.has(key)) counts[key] = count;
  }
  const newFiles = adopted
    .filter((a) => !new Set(baseline.files).has(a.file))
    .map((a) => a.file);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return {
    ...baseline,
    files: sortedUnique([...baseline.files, ...newFiles]),
    total,
    counts,
  };
}
