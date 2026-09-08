import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import type { WorkspaceDebrisFinding } from "./types.js";
import type { IgnoredWorkspaceCandidate } from "./workspace-types/ignored-workspace-candidate.js";
import type { UntrackedWorkspaceCandidate } from "./workspace-types/untracked-workspace-candidate.js";
type WorkspaceDebrisFindingInput = {
    candidate: UntrackedWorkspaceCandidate | IgnoredWorkspaceCandidate;
    sources: readonly ReferenceSourceContent[];
    inventoryPaths: readonly string[];
    analysisBoundary: string;
    unobservedMechanisms: readonly string[];
};
/** Creates an advisory finding when no inbound usage is discovered. */
export declare function workspaceDebrisFinding(input: WorkspaceDebrisFindingInput): WorkspaceDebrisFinding | undefined;
export {};
