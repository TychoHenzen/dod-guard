import type { GitCommit, GitFileChange } from "./types.js";
import { resolveLogicalActivities } from "./git-history-identities.js";

export function fileIdentities(
  commits: readonly GitCommit[],
): ReadonlyMap<GitFileChange, string> {
  return resolveLogicalActivities(commits).identitiesByChange;
}

function commitFiles(
  commit: GitCommit,
  identities: ReadonlyMap<GitFileChange, string>,
): Set<string> {
  return new Set(
    commit.changes.map((change) => identities.get(change) ?? change.path),
  );
}

export function partitionQualifies(
  commits: readonly GitCommit[],
  identities: ReadonlyMap<GitFileChange, string>,
): boolean {
  return (
    commits.length >= 5 &&
    new Set(commits.flatMap((commit) => [...commitFiles(commit, identities)]))
      .size >= 3
  );
}

function fileTouchCounts(
  touchedByCommit: readonly Set<string>[],
): Map<string, number> {
  const touches = new Map<string, number>();
  for (const files of touchedByCommit) {
    for (const file of files) touches.set(file, (touches.get(file) ?? 0) + 1);
  }
  return touches;
}

function windowFiles(
  touchedByCommit: readonly Set<string>[],
  start: number,
  end: number,
): Set<string> {
  return new Set(
    touchedByCommit.slice(start, end).flatMap((files) => [...files]),
  );
}

function weightedFiles(
  files: Iterable<string>,
  touches: ReadonlyMap<string, number>,
  commitCount: number,
): number {
  return [...files].reduce(
    (total, file) =>
      total + Math.log((1 + commitCount) / (1 + (touches.get(file) ?? 0))) + 1,
    0,
  );
}

export function prepareWeightedSimilarity(
  commits: readonly GitCommit[],
  identities: ReadonlyMap<GitFileChange, string>,
) {
  const touchedByCommit = commits.map((commit) =>
    commitFiles(commit, identities),
  );
  return {
    touchedByCommit,
    touches: fileTouchCounts(touchedByCommit),
    commitCount: commits.length,
  };
}

export function weightedSimilarity(
  input: ReturnType<typeof prepareWeightedSimilarity>,
  cut: number,
): number {
  const { touchedByCommit, touches, commitCount } = input;
  const left = windowFiles(touchedByCommit, cut - 5, cut);
  const right = windowFiles(touchedByCommit, cut, cut + 5);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  const intersection = [...left].filter((file) => right.has(file));
  const intersectionWeight = weightedFiles(intersection, touches, commitCount);
  const unionWeight = weightedFiles(union, touches, commitCount);
  return intersectionWeight / unionWeight;
}
