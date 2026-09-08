import type { GitCommit, GitFileChange } from "./types.js";
export declare function partitionQualifies(commits: readonly GitCommit[], identities: ReadonlyMap<GitFileChange, string>): boolean;
/** Splits qualifying close file-set changes in deterministic chronological order. */
export declare function splitAtChangePoint(commits: readonly GitCommit[]): GitCommit[][];
