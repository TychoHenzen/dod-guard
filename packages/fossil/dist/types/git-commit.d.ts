import type { GitFileChange } from "./git-file-change.js";
export interface GitCommit {
    readonly hash: string;
    readonly committerTimestampMs: number;
    readonly changes: readonly GitFileChange[];
}
