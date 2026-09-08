import type { GitCommit, LogicalFileActivity } from "../types.js";
import type { LogicalIdentityResolution } from "./logical-identity-resolution.js";
export interface AssembleBurstInput {
    partition: readonly GitCommit[];
    fullChronologicalHistory: readonly GitCommit[];
    activitiesByIdentity: ReadonlyMap<string, LogicalFileActivity>;
    resolution: LogicalIdentityResolution;
    commitByHash: ReadonlyMap<string, GitCommit>;
    commitIndexByHash: ReadonlyMap<string, number>;
}
