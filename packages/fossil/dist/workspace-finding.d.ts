import type { ReferenceSourceContent } from "./reference-analysis-types.js";
import type { ReferenceGraph, WorkspaceDebrisFinding } from "./types.js";
import type { IgnoredWorkspaceCandidate, UntrackedWorkspaceCandidate } from "./workspace-types/index.js";
type WorkspaceDebrisFindingInput = {
    candidate: UntrackedWorkspaceCandidate | IgnoredWorkspaceCandidate;
    sources: readonly ReferenceSourceContent[];
    referenceGraph?: ReferenceGraph;
    inventoryPaths: readonly string[];
    analysisBoundary: string;
    unobservedMechanisms: readonly string[];
};
/** Creates an advisory finding when no inbound usage is discovered. */
export declare function workspaceDebrisFinding(input: WorkspaceDebrisFindingInput): WorkspaceDebrisFinding | undefined;
export {};
