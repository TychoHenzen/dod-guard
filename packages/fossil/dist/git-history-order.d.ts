import type { AnalysisWarning, GitCommit } from "./types.js";
/** Returns a chronological copy ordered by UTC epoch and ordinal commit hash. */
export declare function sortCommitsChronologically(commits: readonly GitCommit[]): GitCommit[];
/** Reports future-dated commits as incomplete history evidence in deterministic order. */
export declare function futureCommitWarnings(commits: readonly GitCommit[], analysisTimestampMs: number): AnalysisWarning[];
/** Reports the nonfatal absence of Git history needed for burst analysis. */
export declare function emptyHistoryWarnings(commits: readonly GitCommit[]): AnalysisWarning[];
