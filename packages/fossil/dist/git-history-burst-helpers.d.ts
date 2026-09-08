import type { GitCommit, GitFileChange, LogicalFileActivity } from "./types.js";
export declare function commitsWithIdentity(commits: readonly GitCommit[], identity: string, identitiesByChange: ReadonlyMap<GitFileChange, string>): number;
export declare function changesByIdentity(commits: readonly GitCommit[], identitiesByChange: ReadonlyMap<GitFileChange, string>): Map<string, GitFileChange[]>;
export declare function filePath(activity: LogicalFileActivity | undefined, changes: readonly GitFileChange[], identity: string): string;
export declare function partitionCommits(partition: readonly GitCommit[], commitByHash: ReadonlyMap<string, GitCommit>): GitCommit[];
export declare function finalCommitIndex(commits: readonly GitCommit[], commitIndexByHash: ReadonlyMap<string, number>): number;
