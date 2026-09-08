import type { Burst, GitCommit, LogicalFileActivity } from "./types.js";
import type { LogicalIdentityResolution } from "./git-history-types/logical-identity-resolution.js";
export declare function assembleBurst(partition: readonly GitCommit[], fullChronologicalHistory: readonly GitCommit[], activitiesByIdentity: ReadonlyMap<string, LogicalFileActivity>, resolution: LogicalIdentityResolution, commitByHash: ReadonlyMap<string, GitCommit>, commitIndexByHash: ReadonlyMap<string, number>): Burst;
