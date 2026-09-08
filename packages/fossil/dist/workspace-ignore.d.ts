import type { IgnoreProvenance } from "./workspace-types/ignore-provenance.js";
import type { UntrackedWorkspaceCandidate } from "./workspace-types/untracked-workspace-candidate.js";
import type { WorkspaceFileMetadata } from "./workspace-types/workspace-file-metadata.js";
export { oldIgnoredWorkspaceCandidates, } from "./workspace-ignore-candidates.js";
/** Parses NUL-delimited source, line, rule, and path records. */
export declare function parseVerboseCheckIgnore(output: string, globalExcludePath?: string): readonly IgnoreProvenance[];
/** Selects old regular untracked files for later evidence checks. */
export declare function oldUntrackedWorkspaceCandidates(files: readonly WorkspaceFileMetadata[], analysisTimestampMs: number, minimumAgeDays: number): readonly UntrackedWorkspaceCandidate[];
