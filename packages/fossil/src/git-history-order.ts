import type { AnalysisWarning, GitCommit } from "./types.js";

/** Returns a chronological copy ordered by UTC epoch and hash. */
export function sortCommitsChronologically(
  commits: readonly GitCommit[],
): GitCommit[] {
  return [...commits].sort(
    (left, right) =>
      left.committerTimestampMs - right.committerTimestampMs ||
      (left.hash < right.hash ? -1 : left.hash > right.hash ? 1 : 0),
  );
}

/** Reports future-dated commits as incomplete history evidence. */
export function futureCommitWarnings(
  commits: readonly GitCommit[],
  analysisTimestampMs: number,
): AnalysisWarning[] {
  return sortCommitsChronologically(commits)
    .filter((commit) => commit.committerTimestampMs > analysisTimestampMs)
    .map((commit) => ({
      code: "future_commit",
      message:
        `Commit ${commit.hash} has a committer timestamp after ` +
        "analysis time.",
    }));
}

/** Reports the nonfatal absence of Git history needed for burst analysis. */
export function emptyHistoryWarnings(
  commits: readonly GitCommit[],
): AnalysisWarning[] {
  return commits.length === 0
    ? [
        {
          code: "empty_repository",
          message:
            "Repository has no commits; burst and consolidation history is " +
            "unavailable.",
        },
      ]
    : [];
}
