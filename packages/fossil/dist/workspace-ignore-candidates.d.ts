import type { IgnoreProvenance } from "./workspace-types/ignore-provenance.js";
import type { IgnoredWorkspaceCandidate } from "./workspace-types/ignored-workspace-candidate.js";
import type { WorkspaceFileMetadata } from "./workspace-types/workspace-file-metadata.js";
export declare function oldIgnoredWorkspaceCandidates(input: {
    files: readonly WorkspaceFileMetadata[];
    provenance: readonly IgnoreProvenance[];
    analysisTimestampMs: number;
    minimumAgeDays: number;
}): readonly IgnoredWorkspaceCandidate[];
