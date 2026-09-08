import type { GitCommit } from "./types.js";
export { partitionQualifies } from "./git-history-change-point-scoring.js";
/** Splits qualifying close file-set changes chronologically. */
export declare function splitAtChangePoint(commits: readonly GitCommit[]): GitCommit[][];
