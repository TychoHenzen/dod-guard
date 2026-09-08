/** Public compatibility boundary for reference-analysis helpers. */
import * as boundary from "./reference-analysis-boundary.js";
import type { BoundedReferenceReadResult, ReferenceCandidate, StableReferenceSourceBoundary } from "./reference-analysis-types/index.js";
export { analyzeJavaScriptReferences, analyzeReferences, } from "./reference-analysis-public.js";
export declare const analyzeJavaScriptReferencesWithinBoundary: typeof boundary.analyzeJavaScriptReferencesWithinBoundary;
export { markUnresolvedCandidateEvidence, regradeVestigialEdges, unsupportedCandidateReferenceGraph, } from "./reference-analysis-candidate-evidence.js";
export { DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES, } from "./reference-analysis-limits.js";
export { readBoundedReferenceSources } from "./reference-read-bounded.js";
export { readReferenceSources } from "./reference-read-basic.js";
export declare function readStableReferenceSources({ sources, boundary, maximumFileBytes, maximumTotalBytes, }: {
    sources: readonly ReferenceCandidate[];
    boundary: StableReferenceSourceBoundary;
    maximumFileBytes?: number;
    maximumTotalBytes?: number;
}): BoundedReferenceReadResult;
export type { BoundedReferenceReadResult, ReferenceAnalysisResult, ReferenceCandidate, ReferenceContainmentBoundary, ReferenceReadResult, ReferenceSourceContent, ReferenceSourceMetadataReader, ReferenceSourceReader, ReferenceSourceSnapshot, StableReferenceSourceBoundary, } from "./reference-analysis-types/index.js";
