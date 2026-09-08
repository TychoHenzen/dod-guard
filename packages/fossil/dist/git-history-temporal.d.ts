import type { GitCommit } from "./types.js";
/** Splits commits where an adjacent timestamp gap exceeds the limit. */
export declare function splitTemporalClusters(commits: readonly GitCommit[], gapMilliseconds: number): GitCommit[][];
