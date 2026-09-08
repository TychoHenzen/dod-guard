import type { GitCommit } from "./types.js";
export { partitionQualifies } from "./git-history-change-point-scoring.js";
/** Splits qualifying close file-set changes in deterministic chronological order. */
export declare function splitAtChangePoint(commits: readonly GitCommit[]): GitCommit[][];
