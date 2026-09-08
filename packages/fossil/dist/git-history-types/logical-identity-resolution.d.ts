import type { GitFileChange, LogicalFileActivity } from "../types.js";
export interface LogicalIdentityResolution {
    readonly activities: readonly LogicalFileActivity[];
    readonly identitiesByChange: ReadonlyMap<GitFileChange, string>;
}
