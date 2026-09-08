import type { GitCommit, LogicalFileActivity } from "./types.js";
import type { LogicalIdentityResolution } from "./git-history-types/index.js";
export declare function resolveLogicalActivities(commits: readonly GitCommit[]): LogicalIdentityResolution;
/** Collapses rename chains while keeping copies and recreations distinct. */
export declare function resolveRenameActivities(commits: readonly GitCommit[]): LogicalFileActivity[];
