import type { AnalysisWarning, Burst, BurstFileActivity, GitCommit, LogicalFileActivity } from "./types.js";
/** Default maximum number of included non-merge commit records. */
export declare const DEFAULT_MAXIMUM_INCLUDED_COMMITS = 100000;
/** Rejects included history that cannot be analyzed within the commit resource budget. */
export declare function assertIncludedCommitLimit(includedCommitCount: number, maximumIncludedCommits?: number): void;
/** Arguments for the raw history stream consumed by parseNonMergeGitLog(). */
export declare function nonMergeGitLogArguments(): readonly string[];
/** Arguments for checking whether Git marks the repository as shallow. */
export declare function shallowRepositoryArguments(): readonly string[];
/** Turns Git's strict shallow-repository response into completeness evidence. */
export declare function shallowHistoryWarnings(result: string): AnalysisWarning[];
/** Arguments for reading the sparse-checkout setting for the target worktree. */
export declare function sparseCheckoutArguments(): readonly string[];
/** Turns Git's strict sparse-checkout response into current-tree completeness evidence. */
export declare function sparseCheckoutWarnings(result: string): AnalysisWarning[];
/** Returns a chronological copy ordered by UTC epoch and ordinal commit hash. */
export declare function sortCommitsChronologically(commits: readonly GitCommit[]): GitCommit[];
/** Reports future-dated commits as incomplete history evidence in deterministic order. */
export declare function futureCommitWarnings(commits: readonly GitCommit[], analysisTimestampMs: number): AnalysisWarning[];
/** Reports the nonfatal absence of Git history needed for burst analysis. */
export declare function emptyHistoryWarnings(commits: readonly GitCommit[]): AnalysisWarning[];
/** Parses the NUL-delimited non-merge stream requested by nonMergeGitLogArguments(). */
export declare function parseNonMergeGitLog(rawLog: string): GitCommit[];
/** Normalizes extension options while preserving deterministic first-occurrence order. */
export declare function normalizeExtensions(values: readonly string[]): string[];
/** Keeps whole candidate identities for later burst and score calculations. */
export declare function filterHistoryByExtensions(commits: readonly GitCommit[], extensions: ReadonlySet<string>): GitCommit[];
/** Splits chronological included commits where the adjacent timestamp gap exceeds the supplied milliseconds. */
export declare function splitTemporalClusters(commits: readonly GitCommit[], gapMilliseconds: number): GitCommit[][];
/** Splits qualifying close file-set changes in deterministic chronological order. */
export declare function splitAtChangePoint(commits: readonly GitCommit[]): GitCommit[][];
/** Retains only clusters whose closed state was established by the caller. */
export declare function retainQualifiedClosedClusters(clusters: readonly (readonly GitCommit[])[]): GitCommit[][];
/** Retains temporal clusters that have remained inactive for the full configured gap. */
export declare function retainClosedTemporalClusters(clusters: readonly (readonly GitCommit[])[], analysisTimestampMs: number, gapMilliseconds: number): GitCommit[][];
/** Selects files that meet the absolute post-burst survivor threshold. */
export declare function selectAbsoluteSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[];
/** Selects files meeting the positive relative post-burst survivor threshold. */
export declare function selectRelativeSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[];
/** Selects files meeting either the absolute or positive relative survivor threshold. */
export declare function selectSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[];
/** Selects current burst files that meet neither survivor rule. */
export declare function selectFossilCandidates(files: readonly BurstFileActivity[]): BurstFileActivity[];
/** Selects deleted burst paths that meet neither survivor rule. */
export declare function selectDeletedNonSurvivorPaths(files: readonly BurstFileActivity[]): string[];
/** Collapses rename chains while keeping copies and path recreations as distinct identities. */
export declare function resolveRenameActivities(commits: readonly GitCommit[]): LogicalFileActivity[];
/** Assembles qualified recursive partitions into deterministic closed burst activity. */
export declare function assembleClosedBursts(fullChronologicalHistory: readonly GitCommit[], closedTemporalClusters: readonly (readonly GitCommit[])[]): Burst[];
