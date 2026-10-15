// Compares the quality findings of the files a pull request changes with the same files at the merge base,
// then decides which findings are new (blocking) and whether the pull request paid down enough old ones.

import { GENERATED_PATHS, isGenerated, normalizePath } from "./pr-gate-paths.mjs";

export const SEVERITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });

export function severityRank(severity) {
  const rank = SEVERITY_RANK[severity];
  if (rank === undefined) throw new Error(`unknown quality severity: ${severity}`);
  return rank;
}

/** Identity of a finding across revisions. Line numbers and measured values move; the rule and subject do not. */
export function findingKey(violation) {
  return `${violation.rule}|${violation.message.replaceAll(/\d+/g, "#")}`;
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const group of groups.values()) group.sort((a, b) => a.line - b.line);
  return groups;
}

function isWorse(head, base) {
  if (severityRank(head.severity) > severityRank(base.severity)) return true;
  return typeof head.metric === "number" && typeof base.metric === "number" && head.metric > base.metric;
}

/** Split one file's findings into new, still-present, fixed and grown. Matching is by count per key. */
export function compareFindings(head, base) {
  const result = { fresh: [], existing: [], resolved: [], worsened: [] };
  const headGroups = groupBy(head, findingKey);
  const baseGroups = groupBy(base, findingKey);
  for (const key of new Set([...headGroups.keys(), ...baseGroups.keys()])) {
    const now = headGroups.get(key) ?? [];
    const before = baseGroups.get(key) ?? [];
    const paired = Math.min(now.length, before.length);
    for (let index = 0; index < paired; index += 1) {
      result.existing.push(now[index]);
      if (isWorse(now[index], before[index])) result.worsened.push({ ...now[index], was: before[index] });
    }
    result.fresh.push(...now.slice(paired));
    result.resolved.push(...before.slice(paired));
  }
  return result;
}

// A finding that left one changed file and appeared in another with the same key is moved code, not new debt.
function absorbMoves(total) {
  const pool = groupBy(total.resolved, findingKey);
  const fresh = [];
  const moved = [];
  for (const finding of total.fresh) {
    const candidates = pool.get(findingKey(finding));
    if (candidates?.length) {
      candidates.pop();
      moved.push(finding);
    } else {
      fresh.push(finding);
    }
  }
  return { ...total, fresh, moved, resolved: [...pool.values()].flat() };
}

function byFile(violations, excludes) {
  const kept = violations.filter((violation) => !isGenerated(violation.file, excludes));
  return groupBy(kept, (violation) => normalizePath(violation.file));
}

/**
 * Classify every finding in the changed files. `files` is `[{ path, basePath }]` from parseNameStatus, and the two
 * violation lists come from scanning the head and the merge base with the same roots.
 */
export function classifyChanges(files, headViolations, baseViolations, excludes = GENERATED_PATHS) {
  const headByFile = byFile(headViolations, excludes);
  const baseByFile = byFile(baseViolations, excludes);
  const total = { fresh: [], existing: [], resolved: [], worsened: [] };
  for (const { path, basePath } of files) {
    const base = basePath === null ? [] : (baseByFile.get(basePath) ?? []);
    const compared = compareFindings(headByFile.get(path) ?? [], base);
    for (const name of Object.keys(total)) total[name].push(...compared[name]);
  }
  return absorbMoves(total);
}

const isTopTier = (finding) => severityRank(finding.severity) >= SEVERITY_RANK.medium;

/**
 * The pull request must remove `fixMediumHigh` medium/high findings or `fixLow` low ones that already existed in the
 * files it changes. Each target is capped at what exists, so a clean file never makes the gate unsatisfiable.
 */
export function evaluateQuota(classified, { fixMediumHigh, fixLow }) {
  const atBase = [...classified.existing, ...classified.moved, ...classified.resolved];
  const available = { top: atBase.filter(isTopTier).length, low: atBase.filter((f) => !isTopTier(f)).length };
  const fixed = {
    top: classified.resolved.filter(isTopTier).length,
    low: classified.resolved.filter((f) => !isTopTier(f)).length,
  };
  const required = { top: Math.min(fixMediumHigh, available.top), low: Math.min(fixLow, available.low) };
  const disabled = fixMediumHigh === 0 && fixLow === 0;
  const satisfied =
    disabled ||
    available.top + available.low === 0 ||
    (required.top > 0 && fixed.top >= required.top) ||
    (required.low > 0 && fixed.low >= required.low);
  return { satisfied, available, fixed, required, targets: { top: fixMediumHigh, low: fixLow } };
}

/** A new finding blocks at `blockOn` or above, unless `ruleBlockOn` sets a different threshold for its rule. */
export function evaluateGate(classified, options) {
  const thresholdFor = (finding) => severityRank(options.ruleBlockOn?.[finding.rule] ?? options.blockOn);
  const blocking = classified.fresh.filter((finding) => severityRank(finding.severity) >= thresholdFor(finding));
  const quota = evaluateQuota(classified, options);
  return { blocking, quota, passed: blocking.length === 0 && quota.satisfied };
}
