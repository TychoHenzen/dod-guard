import type { GitCommit, GitFileChange, LogicalFileActivity } from "./types.js";

function identityForChange(
  change: GitFileChange,
  identitiesByChange: ReadonlyMap<GitFileChange, string>,
): string {
  return identitiesByChange.get(change) ?? change.path;
}

function changeMatchesIdentity(
  commit: GitCommit,
  identity: string,
  identitiesByChange: ReadonlyMap<GitFileChange, string>,
): boolean {
  return commit.changes.some(
    (change) => identityForChange(change, identitiesByChange) === identity,
  );
}

export function commitsWithIdentity(
  commits: readonly GitCommit[],
  identity: string,
  identitiesByChange: ReadonlyMap<GitFileChange, string>,
): number {
  return new Set(
    commits
      .filter((commit) =>
        changeMatchesIdentity(commit, identity, identitiesByChange),
      )
      .map((commit) => commit.hash),
  ).size;
}

export function changesByIdentity(
  commits: readonly GitCommit[],
  identitiesByChange: ReadonlyMap<GitFileChange, string>,
): Map<string, GitFileChange[]> {
  const identities = new Map<string, GitFileChange[]>();
  for (const commit of commits) {
    for (const change of commit.changes) {
      const identity = identityForChange(change, identitiesByChange);
      const changes = identities.get(identity) ?? [];
      changes.push(change);
      identities.set(identity, changes);
    }
  }
  return identities;
}

export function filePath(
  activity: LogicalFileActivity | undefined,
  changes: readonly GitFileChange[],
  identity: string,
): string {
  if (activity) {
    if (activity.currentPath) return activity.currentPath;
    const previousPath = activity.paths.at(-1);
    if (previousPath) return previousPath;
  }
  const change = changes.at(-1);
  if (change) return change.path;
  return identity;
}

export function partitionCommits(
  partition: readonly GitCommit[],
  commitByHash: ReadonlyMap<string, GitCommit>,
): GitCommit[] {
  return partition.map((commit) => commitByHash.get(commit.hash) ?? commit);
}

export function finalCommitIndex(
  commits: readonly GitCommit[],
  commitIndexByHash: ReadonlyMap<string, number>,
): number {
  return Math.max(
    ...commits.map((commit) => commitIndexByHash.get(commit.hash) ?? -1),
  );
}
