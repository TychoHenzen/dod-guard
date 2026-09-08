import type { GitCommit } from "./types.js";

/** Splits chronological included commits where the adjacent timestamp gap exceeds the supplied milliseconds. */
export function splitTemporalClusters(commits: readonly GitCommit[], gapMilliseconds: number): GitCommit[][] {
  if (gapMilliseconds < 0) throw new RangeError("gapMilliseconds must be nonnegative");
  const clusters: GitCommit[][] = [];
  for (const commit of commits) {
    const current = clusters.at(-1);
    const previous = current?.at(-1);
    if (!(current && previous) || commit.committerTimestampMs - previous.committerTimestampMs > gapMilliseconds) {
      clusters.push([commit]);
      continue;
    }
    current.push(commit);
  }
  return clusters;
}
