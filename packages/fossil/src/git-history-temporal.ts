import type { GitCommit } from "./types.js";

function startsNewCluster(current: GitCommit[] | undefined, commit: GitCommit, gapMilliseconds: number): boolean {
  const previous = current?.at(-1);
  return !(current && previous) || commit.committerTimestampMs - previous.committerTimestampMs > gapMilliseconds;
}

/** Splits chronological included commits where the adjacent timestamp gap exceeds the supplied milliseconds. */
export function splitTemporalClusters(commits: readonly GitCommit[], gapMilliseconds: number): GitCommit[][] {
  if (gapMilliseconds < 0) throw new RangeError("gapMilliseconds must be nonnegative");
  const clusters: GitCommit[][] = [];
  for (const commit of commits) {
    const current = clusters.at(-1);
    if (startsNewCluster(current, commit, gapMilliseconds)) {
      clusters.push([commit]);
      continue;
    }
    clusters.at(-1)?.push(commit);
  }
  return clusters;
}
