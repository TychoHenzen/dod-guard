import type { IgnoreProvenance } from "./workspace-types/ignore-provenance.js";
import type { IgnoredWorkspaceCandidate, WorkspaceFileMetadata } from "./workspace-types/index.js";
export declare function oldIgnoredWorkspaceCandidates(input: {
    files: readonly WorkspaceFileMetadata[];
    provenance: readonly IgnoreProvenance[];
    analysisTimestampMs: number;
    minimumAgeDays: number;
}): readonly IgnoredWorkspaceCandidate[];
