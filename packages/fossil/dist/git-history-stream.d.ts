import type { GitCommit } from "./types.js";
/** Parses the NUL-delimited non-merge stream requested by nonMergeGitLogArguments(). */
export declare function parseNonMergeGitLog(rawLog: string): GitCommit[];
