import type { GitCommit } from "./types.js";
/** Splits chronological included commits where the adjacent timestamp gap exceeds the supplied milliseconds. */
export declare function splitTemporalClusters(commits: readonly GitCommit[], gapMilliseconds: number): GitCommit[][];
