import type { GitCommit, GitFileChange } from "./types.js";
import type { ChangePointCandidate } from "./git-history-types/change-point-candidate.js";
import { fileIdentities, partitionQualifies, weightedSimilarity } from "./git-history-change-point-scoring.js";

export { partitionQualifies } from "./git-history-change-point-scoring.js";

const MIN_CHANGE_POINT_GAP_MS = 4 * 60 * 60 * 1_000;
const MAX_CHANGE_POINT_SIMILARITY = 0.1;

function validChangePoint({ commits, cut, start, end, identities }: {
  commits: readonly GitCommit[];
  cut: number;
  start: number;
  end: number;
  identities: ReadonlyMap<GitFileChange, string>;
}): boolean {
  const gapMilliseconds = commits[cut].committerTimestampMs - commits[cut - 1].committerTimestampMs;
  return (
    gapMilliseconds >= MIN_CHANGE_POINT_GAP_MS &&
    partitionQualifies(commits.slice(start, cut), identities) &&
    partitionQualifies(commits.slice(cut, end), identities)
  );
}

function compareChangePoints(left: ChangePointCandidate, right: ChangePointCandidate): number {
  return left.similarity - right.similarity || right.gapMilliseconds - left.gapMilliseconds || left.cut - right.cut;
}

function selectChangePoint({ commits, start, end, identities }: {
  commits: readonly GitCommit[];
  start: number;
  end: number;
  identities: ReadonlyMap<GitFileChange, string>;
}): ChangePointCandidate | undefined {
  const candidates: ChangePointCandidate[] = [];
  for (let cut = start + 5; cut <= end - 5; cut += 1) {
    if (!validChangePoint({ commits, cut, start, end, identities })) continue;
    const gapMilliseconds = commits[cut].committerTimestampMs - commits[cut - 1].committerTimestampMs;
    const similarity = weightedSimilarity(commits, cut, identities);
    if (similarity <= MAX_CHANGE_POINT_SIMILARITY) candidates.push({ cut, gapMilliseconds, similarity });
  }
  return candidates.sort(compareChangePoints)[0];
}

function splitChangePoints({ commits, start, end, identities }: {
  commits: readonly GitCommit[];
  start: number;
  end: number;
  identities: ReadonlyMap<GitFileChange, string>;
}): GitCommit[][] {
  const candidate = selectChangePoint({ commits, start, end, identities });
  if (!candidate) return [commits.slice(start, end)];
  return [
    ...splitChangePoints({ commits, start, end: candidate.cut, identities }),
    ...splitChangePoints({ commits, start: candidate.cut, end, identities }),
  ];
}

/** Splits qualifying close file-set changes in deterministic chronological order. */
export function splitAtChangePoint(commits: readonly GitCommit[]): GitCommit[][] {
  if (commits.length === 0) return [];
  return splitChangePoints({ commits, start: 0, end: commits.length, identities: fileIdentities(commits) });
}
