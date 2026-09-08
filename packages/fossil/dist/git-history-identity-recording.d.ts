import type { GitCommit, GitFileChange } from "./types.js";
import type { LogicalIdentityState } from "./git-history-types/index.js";
export interface IdentityContext {
    activeByPath: Map<string, string>;
    generationsByPath: Map<string, number>;
    identitiesByChange: Map<GitFileChange, string>;
    states: Map<string, LogicalIdentityState>;
}
export declare function recordChange(change: GitFileChange, commit: GitCommit, context: IdentityContext): void;
