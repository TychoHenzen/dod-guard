import type { AnalysisWarning } from "./types.js";
declare const RECORD_SEPARATOR = "\u001E";
/** Default maximum number of included non-merge commit records. */
export declare const DEFAULT_MAXIMUM_INCLUDED_COMMITS = 100000;
/** Rejects history that exceeds the commit resource budget. */
export declare function assertIncludedCommitLimit(includedCommitCount: number, maximumIncludedCommits?: number): void;
/** Arguments for the raw history stream consumed by parseNonMergeGitLog(). */
export declare function nonMergeGitLogArguments(): readonly string[];
/** Arguments for checking whether Git marks the repository as shallow. */
export declare function shallowRepositoryArguments(): readonly string[];
/** Turns Git's shallow-repository response into completeness evidence. */
export declare function shallowHistoryWarnings(result: string): AnalysisWarning[];
/** Arguments for reading the sparse-checkout setting. */
export declare function sparseCheckoutArguments(): readonly string[];
/** Turns Git's sparse-checkout response into tree completeness evidence. */
export declare function sparseCheckoutWarnings(result: string): AnalysisWarning[];
export { RECORD_SEPARATOR };
