import type { AnalysisWarning, ReferenceGraph, SourceLanguage } from "./types.js";
/** Default hard cap for one source retained by reference analysis. */
export declare const DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES = 1048576;
/** Default hard cap for all source content retained by one reference analysis. */
export declare const DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES = 268435456;
/** Candidate metadata supplied to a language-specific reference backend. */
export interface ReferenceCandidate {
    readonly path: string;
    readonly language: SourceLanguage;
}
/** The injected synchronous read boundary for eligible current source files. */
export type ReferenceSourceReader = (source: ReferenceCandidate) => string;
/** Exact source metadata that allows a size decision before content is read. */
export type ReferenceSourceMetadataReader = (source: ReferenceCandidate) => {
    readonly byteLength: number;
};
/** Source content retained for a later language-specific parser. */
export interface ReferenceSourceContent extends ReferenceCandidate {
    readonly content: string;
}
/** Nonfatal source-read evidence returned before parsing or reference resolution. */
export interface ReferenceReadResult {
    readonly graph: ReferenceGraph;
    readonly sources: readonly ReferenceSourceContent[];
    readonly warnings: readonly AnalysisWarning[];
}
/** Bounded source-read evidence including bytes accepted for later parsing. */
export interface BoundedReferenceReadResult extends ReferenceReadResult {
    readonly acceptedBytes: number;
}
/** Stable file metadata captured before and immediately before a source-content read. */
export interface ReferenceSourceSnapshot {
    readonly identity: string;
    readonly isRegularFile: boolean;
    readonly byteLength: number;
    readonly canonicalPath: string;
}
/** Injected stable-read boundary for detecting changes between inventory and content read. */
export interface StableReferenceSourceBoundary {
    readonly inspect: (source: ReferenceCandidate) => ReferenceSourceSnapshot | undefined;
    readonly read: ReferenceSourceReader;
}
/** Canonical path boundary used to keep resolved relative imports inside the repository. */
export interface ReferenceContainmentBoundary {
    readonly canonicalRepositoryRoot: string;
    readonly canonicalize: (path: string) => string;
}
/** Reference graph plus nonfatal containment evidence. */
export interface ReferenceAnalysisResult {
    readonly graph: ReferenceGraph;
    readonly warnings: readonly AnalysisWarning[];
}
/** Parses and resolves supported TypeScript and JavaScript module references from current source inventory. */
export declare function analyzeJavaScriptReferences(sources: readonly ReferenceSourceContent[]): ReferenceGraph;
/** Parses JavaScript references while rejecting relative targets outside the canonical repository boundary. */
export declare function analyzeJavaScriptReferencesWithinBoundary(sources: readonly ReferenceSourceContent[], boundary: ReferenceContainmentBoundary): ReferenceAnalysisResult;
/** Parses and resolves the currently supported TypeScript, JavaScript, C#, and Rust reference forms. */
export declare function analyzeReferences(sources: readonly ReferenceSourceContent[]): ReferenceGraph;
/** Regrades current edges between two fossil candidates before scoring. */
export declare function regradeVestigialEdges(graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): ReferenceGraph;
/** Marks candidate reference evidence unavailable when unresolved paths could target it. */
export declare function markUnresolvedCandidateEvidence(graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): ReferenceGraph;
/** Produces normalized unavailable evidence for candidates with no reference backend. */
export declare function unsupportedCandidateReferenceGraph(candidates: readonly ReferenceCandidate[]): ReferenceGraph;
/** Reads eligible sources without letting one unreadable file stop later parsing work. */
export declare function readReferenceSources(sources: readonly ReferenceCandidate[], readSource: ReferenceSourceReader): ReferenceReadResult;
/** Reads sources below a per-file byte limit while preserving unavailable reference evidence for skipped files. */
export declare function readBoundedReferenceSources(sources: readonly ReferenceCandidate[], readMetadata: ReferenceSourceMetadataReader, readSource: ReferenceSourceReader, maximumFileBytes?: number, maximumTotalBytes?: number): BoundedReferenceReadResult;
/** Reads stable regular files after re-checking their identity, type, and canonical path. */
export declare function readStableReferenceSources(sources: readonly ReferenceCandidate[], boundary: StableReferenceSourceBoundary, maximumFileBytes?: number, maximumTotalBytes?: number): BoundedReferenceReadResult;
