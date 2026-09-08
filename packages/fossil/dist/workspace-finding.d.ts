import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import type { WorkspaceDebrisFinding } from "./types.js";
import type { IgnoredWorkspaceCandidate } from "./workspace-types/ignored-workspace-candidate.js";
import type { UntrackedWorkspaceCandidate } from "./workspace-types/untracked-workspace-candidate.js";
/** Creates a separate advisory workspace-debris finding when no inbound usage evidence is discovered. */
export declare function workspaceDebrisFinding({ candidate, sources, inventoryPaths, analysisBoundary, unobservedMechanisms }: {
    candidate: UntrackedWorkspaceCandidate | IgnoredWorkspaceCandidate;
    sources: readonly ReferenceSourceContent[];
    inventoryPaths: readonly string[];
    analysisBoundary: string;
    unobservedMechanisms: readonly string[];
}): WorkspaceDebrisFinding | undefined;
