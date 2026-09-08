import type { IgnoredWorkspaceCandidate } from "./workspace-types/ignored-workspace-candidate.js";
import type { IgnoreProvenance } from "./workspace-types/ignore-provenance.js";
import type { UntrackedWorkspaceCandidate } from "./workspace-types/untracked-workspace-candidate.js";
import type { WorkspaceFileMetadata } from "./workspace-types/workspace-file-metadata.js";
/** Parses NUL-delimited source, line, rule, and path records from verbose Git ignore output. */
export declare function parseVerboseCheckIgnore(output: string, globalExcludePath?: string): readonly IgnoreProvenance[];
/** Selects old regular untracked files before later ignore and usage-evidence checks. */
export declare function oldUntrackedWorkspaceCandidates(files: readonly WorkspaceFileMetadata[], analysisTimestampMs: number, minimumAgeDays: number): readonly UntrackedWorkspaceCandidate[];
/** Selects old regular ignored files and preserves their matching Git ignore rule provenance. */
export declare function oldIgnoredWorkspaceCandidates(files: readonly WorkspaceFileMetadata[], provenance: readonly IgnoreProvenance[], analysisTimestampMs: number, minimumAgeDays: number): readonly IgnoredWorkspaceCandidate[];
