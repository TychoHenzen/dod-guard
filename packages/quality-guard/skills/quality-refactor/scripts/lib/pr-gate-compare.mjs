// Compares the quality findings of the files a pull request changes with
// the same files at the merge base.

import {
  GENERATED_PATHS,
  isGenerated,
  normalizePath,
} from "./pr-gate-paths.mjs";
import { findingKey, groupBy } from "./pr-gate-key.mjs";
import { absorbMoves } from "./pr-gate-moves.mjs";
import { renameInMessages } from "./pr-gate-rename.mjs";

const SEVERITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });

export function severityRank(severity) {
  const rank = SEVERITY_RANK[severity];
  if (rank === undefined)
    throw new Error(`unknown quality severity: ${severity}`);
  return rank;
}

function isWorse(head, base) {
  if (severityRank(head.severity) > severityRank(base.severity)) return true;
  return (
    Number.isFinite(head.metric) &&
    Number.isFinite(base.metric) &&
    head.metric > base.metric
  );
}

// Findings with the same key are matched by count: extra ones at HEAD
// are new, extra ones at base are fixed.
function compareGroup(now, before, result) {
  const paired = Math.min(now.length, before.length);
  now.slice(0, paired).forEach((finding, index) => {
    result.existing.push(finding);
    if (isWorse(finding, before[index]))
      result.worsened.push({ ...finding, was: before[index] });
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

function byFile(violations, excludes) {
  const kept = violations.filter(
    (violation) => !isGenerated(violation.file, excludes),
  );
  return groupBy(kept, (violation) => normalizePath(violation.file));
}

// An added file has basePath null, which is never a key, so it compares
// against nothing.
function compareFile({ path, basePath }, headByFile, baseByFile) {
  return compareFindings(
    groupAt(headByFile, path),
    groupAt(baseByFile, basePath),
  );
}

/**
 * Classify every finding in the changed files. `files` is
 * `[{ path, basePath }]` from parseNameStatus, and `head` and `base` are
 * the scanner's violations for HEAD and the merge base, scanned with the
 * same roots.
 */
export function classifyChanges({
  files,
  head,
  base,
  excludes = GENERATED_PATHS,
}) {
  const headByFile = byFile(head, excludes);
  const baseByFile = byFile(renameInMessages(base, files), excludes);
  const total = { fresh: [], existing: [], resolved: [], worsened: [] };
  for (const file of files) {
    const compared = compareFile(file, headByFile, baseByFile);
    for (const name of Object.keys(total)) total[name].push(...compared[name]);
  }
  return absorbMoves(total);
}
