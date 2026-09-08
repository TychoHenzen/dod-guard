import type { GitCommit, GitFileChange } from "./types.js";
export declare function fileIdentities(commits: readonly GitCommit[]): ReadonlyMap<GitFileChange, string>;
export declare function partitionQualifies(commits: readonly GitCommit[], identities: ReadonlyMap<GitFileChange, string>): boolean;
export declare function weightedSimilarity(commits: readonly GitCommit[], cut: number, identities: ReadonlyMap<GitFileChange, string>): number;
