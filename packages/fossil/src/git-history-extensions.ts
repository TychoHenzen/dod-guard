import type { GitCommit, GitFileChange } from "./types.js";
import { assertIncludedCommitLimit } from "./git-history-contract.js";
import { resolveLogicalActivities } from "./git-history-identities.js";

function pathExtension(path: string): string {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/** Normalizes extension options while preserving deterministic first-occurrence order. */
export function normalizeExtensions(values: readonly string[]): string[] {
  const normalized = new Set<string>();
  for (const value of values) normalized.add(`.${value.replace(/^\./, "").toLowerCase()}`);
  return [...normalized];
}

function activityPath(activity: ReturnType<typeof resolveLogicalActivities>["activities"][number]): string {
  return activity.currentPath ?? activity.paths.at(-1) ?? "";
}

function selectedChanges(
  commit: GitCommit,
  selected: ReadonlySet<string>,
  identitiesByChange: ReadonlyMap<GitFileChange, string>,
): GitFileChange[] {
  return commit.changes.filter((change) => selected.has(identitiesByChange.get(change) ?? ""));
}

/** Keeps whole candidate identities for later burst and score calculations. */
export function filterHistoryByExtensions(commits: readonly GitCommit[], extensions: ReadonlySet<string>): GitCommit[] {
  if (extensions.size === 0) {
    const included = [...commits];
    assertIncludedCommitLimit(included.length);
    return included;
  }
  const resolution = resolveLogicalActivities(commits);
  const selected = new Set(
    resolution.activities.filter((activity) => extensions.has(pathExtension(activityPath(activity)))).map((activity) => activity.identity),
  );
  const included = commits.flatMap((commit) => {
    const changes = selectedChanges(commit, selected, resolution.identitiesByChange);
    return changes.length === 0 ? [] : [{ ...commit, changes }];
  });
  assertIncludedCommitLimit(included.length);
  return included;
}
