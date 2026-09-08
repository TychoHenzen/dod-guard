import type { Burst } from "./burst.js";
import type { GitCommit } from "./git-commit.js";
import type { LogicalFileActivity } from "./logical-file-activity.js";
export interface BurstAnalysis {
    readonly commits: readonly GitCommit[];
    readonly logicalFiles: readonly LogicalFileActivity[];
    readonly bursts: readonly Burst[];
    readonly deletedPaths: readonly string[];
    readonly historyComplete: boolean;
}
