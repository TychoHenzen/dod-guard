import type { GitCommit, LogicalFileActivity } from "./types.js";
import type { LogicalIdentityResolution } from "./git-history-types/logical-identity-resolution.js";
export declare function resolveLogicalActivities(commits: readonly GitCommit[]): LogicalIdentityResolution;
/** Collapses rename chains while keeping copies and path recreations as distinct identities. */
export declare function resolveRenameActivities(commits: readonly GitCommit[]): LogicalFileActivity[];
