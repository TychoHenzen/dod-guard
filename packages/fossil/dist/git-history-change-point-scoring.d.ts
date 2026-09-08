import type { GitCommit, GitFileChange } from "./types.js";
export declare function fileIdentities(commits: readonly GitCommit[]): ReadonlyMap<GitFileChange, string>;
export declare function partitionQualifies(commits: readonly GitCommit[], identities: ReadonlyMap<GitFileChange, string>): boolean;
export declare function prepareWeightedSimilarity(commits: readonly GitCommit[], identities: ReadonlyMap<GitFileChange, string>): {
    touchedByCommit: Set<string>[];
    touches: Map<string, number>;
    commitCount: number;
};
export declare function weightedSimilarity(input: ReturnType<typeof prepareWeightedSimilarity>, cut: number): number;
