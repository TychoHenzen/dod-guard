import type { Burst, GitCommit, GitFileChange, LogicalFileActivity } from "./types.js";
import type { LogicalIdentityResolution } from "./git-history-types/logical-identity-resolution.js";
import {
  changesByIdentity,
  commitsWithIdentity,
  filePath,
  finalCommitIndex,
  partitionCommits,
} from "./git-history-burst-helpers.js";

function burstFile(
  identity: string,
  changes: readonly GitFileChange[],
  commits: readonly GitCommit[],
  fullChronologicalHistory: readonly GitCommit[],
  finalIndex: number,
  activitiesByIdentity: ReadonlyMap<string, LogicalFileActivity>,
  resolution: LogicalIdentityResolution,
) {
  const activity = activitiesByIdentity.get(identity);
  return {
    identity,
    path: filePath(activity, changes, identity),
    burstCommits: commitsWithIdentity(commits, identity, resolution.identitiesByChange),
    postBurstCommits: commitsWithIdentity(
      fullChronologicalHistory.slice(finalIndex + 1),
      identity,
      resolution.identitiesByChange,
    ),
    createdInBurst: changes.some((change) => change.status === "added" || change.status === "copied"),
    existsAtHead: activity?.existsAtHead ?? true,
  };
}

export function assembleBurst(
  partition: readonly GitCommit[],
  fullChronologicalHistory: readonly GitCommit[],
  activitiesByIdentity: ReadonlyMap<string, LogicalFileActivity>,
  resolution: LogicalIdentityResolution,
  commitByHash: ReadonlyMap<string, GitCommit>,
  commitIndexByHash: ReadonlyMap<string, number>,
): Burst {
  const commits = partitionCommits(partition, commitByHash);
  const identities = changesByIdentity(commits, resolution.identitiesByChange);
  const finalIndex = finalCommitIndex(commits, commitIndexByHash);
  const files = [...identities].map(([identity, changes]) =>
    burstFile(identity, changes, commits, fullChronologicalHistory, finalIndex, activitiesByIdentity, resolution),
  );
  const first = commits[0];
  const last = commits.at(-1);
  if (!(first && last)) throw new Error("Cannot assemble an empty burst");
  return {
    id: `burst-${first.hash}-${last.hash}`,
    startTimestampMs: first.committerTimestampMs,
    endTimestampMs: last.committerTimestampMs,
    commits,
    files,
    closed: true,
  };
}
