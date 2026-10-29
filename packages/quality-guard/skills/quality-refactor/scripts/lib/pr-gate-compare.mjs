// Compares the quality findings of the files a pull request changes with
// the same files at the merge base.

import { GENERATED_PATHS, isGenerated, normalizePath } from "./pr-gate-paths.mjs";

const SEVERITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });

export function severityRank(severity) {
  const rank = SEVERITY_RANK[severity];
  if (rank === undefined) throw new Error(`unknown quality severity: ${severity}`);
  return rank;
}

/** Identity of a finding across revisions. Line numbers and measured values move; the rule and subject do not. */
function findingKey(violation) {
  return `${violation.rule}|${violation.message.replaceAll(/\d+/g, "#")}`;
}

function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const group of groups.values()) group.sort((a, b) => a.line - b.line);
  return groups;
}

function isWorse(head, base) {
  if (severityRank(head.severity) > severityRank(base.severity)) return true;
  return Number.isFinite(head.metric) && Number.isFinite(base.metric) && head.metric > base.metric;
}

// Findings with the same key are matched by count: extra ones at HEAD are new, extra ones at base are fixed.
function compareGroup(now, before, result) {
  const paired = Math.min(now.length, before.length);
  now.slice(0, paired).forEach((finding, index) => {
    result.existing.push(finding);
    if (isWorse(finding, before[index])) result.worsened.push({ ...finding, was: before[index] });
  });
  result.fresh.push(...now.slice(paired));
  result.resolved.push(...before.slice(paired));
}

const groupAt = (groups, key) => groups.get(key) ?? [];

function compareFindings(head, base) {
  const result = { fresh: [], existing: [], resolved: [], worsened: [] };
  const headGroups = groupBy(head, findingKey);
  const baseGroups = groupBy(base, findingKey);
  for (const key of new Set([...headGroups.keys(), ...baseGroups.keys()])) {
    compareGroup(groupAt(headGroups, key), groupAt(baseGroups, key), result);
  }
  return result;
}

// A finding that left one changed file and appeared in another with the same key is moved code, not new debt.
function absorbMoves(total) {
  const pool = groupBy(total.resolved, findingKey);
  // pop() both tests for a leftover fixed finding with this key and uses it.
  const isMoved = (finding) => pool.get(findingKey(finding))?.pop() !== undefined;
  const fresh = [];
  const moved = [];
  for (const finding of total.fresh) (isMoved(finding) ? moved : fresh).push(finding);
  return { ...total, fresh, moved, resolved: [...pool.values()].flat() };
}

function byFile(violations, excludes) {
  const kept = violations.filter((violation) => !isGenerated(violation.file, excludes));
  return groupBy(kept, (violation) => normalizePath(violation.file));
}

// An added file has basePath null, which is never a key, so it compares against nothing.
function compareFile({ path, basePath }, headByFile, baseByFile) {
  return compareFindings(groupAt(headByFile, path), groupAt(baseByFile, basePath));
}

// duplicate-block messages name file paths: map base paths to HEAD paths
// so a renamed file's findings keep their key.
function renameInMessages(base, files) {
  const moves = files.filter((f) => f.basePath && f.basePath !== f.path);
  const rename = (text) =>
    moves.reduce((out, f) => out.replaceAll(f.basePath, f.path), text);
  return base.map((v) => ({ ...v, message: rename(v.message) }));
}

/**
 * Classify every finding in the changed files. `files` is `[{ path, basePath }]` from parseNameStatus, and `head` and
 * `base` are the scanner's violations for HEAD and the merge base, scanned with the same roots.
 */
export function classifyChanges({ files, head, base, excludes = GENERATED_PATHS }) {
  const headByFile = byFile(head, excludes);
  const baseByFile = byFile(renameInMessages(base, files), excludes);
  const total = { fresh: [], existing: [], resolved: [], worsened: [] };
  for (const file of files) {
    const compared = compareFile(file, headByFile, baseByFile);
    for (const name of Object.keys(total)) total[name].push(...compared[name]);
  }
  return absorbMoves(total);
}
