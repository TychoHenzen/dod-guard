import { type ReferenceSourceContent } from "./ref-analyzer.js";
import type { AnalysisWarning, IgnoreSource, WorkspaceDebrisFinding } from "./types.js";
/** Exact Git arguments for non-ignored, NUL-delimited untracked paths. */
export declare const UNTRACKED_DISCOVERY_ARGUMENTS: readonly ["ls-files", "-z", "--others", "--exclude-standard"];
/** Exact Git arguments for ignored, NUL-delimited workspace paths. */
export declare const IGNORED_DISCOVERY_ARGUMENTS: readonly ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"];
/** Exact Git arguments for NUL-delimited verbose ignore provenance. */
export declare const CHECK_IGNORE_ARGUMENTS: readonly ["check-ignore", "-z", "-v", "--stdin"];
/** Regular-file metadata captured after workspace discovery. */
export interface WorkspaceFileMetadata {
    readonly path: string;
    readonly isRegularFile: boolean;
    /** No-follow metadata indicates this path is a symbolic link. */
    readonly isSymbolicLink?: boolean;
    /** No-follow metadata indicates this path is a Windows junction. */
    readonly isJunction?: boolean;
    readonly modifiedTimestampMs: number;
}
/** Injected metadata reader for workspace paths that pass pre-inspection boundaries. */
export type WorkspaceFileMetadataReader = (path: string) => WorkspaceFileMetadata;
/** Metadata collected from allowed workspace paths with nonfatal inspection warnings. */
export interface WorkspaceMetadataInspectionResult {
    readonly metadata: readonly WorkspaceFileMetadata[];
    readonly warnings: readonly AnalysisWarning[];
}
/** An old untracked regular file eligible for later workspace-debris evidence checks. */
export interface UntrackedWorkspaceCandidate {
    readonly path: string;
    readonly kind: "untracked";
    readonly modifiedTimestampMs: number;
}
/** Matching ignore-rule provenance for one ignored workspace path. */
export interface IgnoreProvenance {
    readonly path: string;
    readonly rule: string;
    readonly source: IgnoreSource;
}
/** An old ignored regular file eligible for later workspace-debris evidence checks. */
export interface IgnoredWorkspaceCandidate {
    readonly path: string;
    readonly kind: "ignored";
    readonly modifiedTimestampMs: number;
    readonly ignore: {
        readonly rule: string;
        readonly source: IgnoreSource;
    };
}
/** Parses Git's NUL-delimited path output without changing valid path characters. */
export declare function parseNulDelimitedPaths(output: string): readonly string[];
/** Filters repository-relative discovery paths with bounded `*`, `?`, and `**` caller exclusion globs. */
export declare function filterWorkspaceDiscoveryPaths(paths: readonly string[], excludePatterns: readonly string[]): readonly string[];
/** Reads metadata only for discovered paths outside known dependency-store segments. */
export declare function inspectWorkspaceFileMetadata(paths: readonly string[], readMetadata: WorkspaceFileMetadataReader): readonly WorkspaceFileMetadata[];
/** Reads no-follow metadata, reporting unreadable discovered paths without exposing reader errors. */
export declare function inspectWorkspaceFileMetadataWithWarnings(paths: readonly string[], readMetadata: WorkspaceFileMetadataReader, excludePatterns?: readonly string[]): WorkspaceMetadataInspectionResult;
/** Parses NUL-delimited source, line, rule, and path records from verbose Git ignore output. */
export declare function parseVerboseCheckIgnore(output: string, globalExcludePath?: string): readonly IgnoreProvenance[];
/** Selects old regular untracked files before later ignore and usage-evidence checks. */
export declare function oldUntrackedWorkspaceCandidates(files: readonly WorkspaceFileMetadata[], analysisTimestampMs: number, minimumAgeDays: number): readonly UntrackedWorkspaceCandidate[];
/** Selects old regular ignored files and preserves their matching Git ignore rule provenance. */
export declare function oldIgnoredWorkspaceCandidates(files: readonly WorkspaceFileMetadata[], provenance: readonly IgnoreProvenance[], analysisTimestampMs: number, minimumAgeDays: number): readonly IgnoredWorkspaceCandidate[];
/** Detects resolved imports and exact source-string evidence that an old workspace candidate is in use. */
export declare function hasInboundWorkspaceUsage(candidatePath: string, sources: readonly ReferenceSourceContent[], inventoryPaths: readonly string[]): boolean;
/** Omits workspace candidates when any inbound repository-contained usage evidence is found. */
export declare function omitUsedWorkspaceCandidates<T extends {
    readonly path: string;
}>(candidates: readonly T[], sources: readonly ReferenceSourceContent[], inventoryPaths: readonly string[]): readonly T[];
/** Creates a separate advisory workspace-debris finding when no inbound usage evidence is discovered. */
export declare function workspaceDebrisFinding(candidate: UntrackedWorkspaceCandidate | IgnoredWorkspaceCandidate, sources: readonly ReferenceSourceContent[], inventoryPaths: readonly string[], analysisBoundary: string, unobservedMechanisms: readonly string[]): WorkspaceDebrisFinding | undefined;
