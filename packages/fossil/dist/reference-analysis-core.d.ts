/** Public compatibility boundary for reference-analysis helpers. */
import * as boundary from "./reference-analysis-boundary.js";
export { analyzeJavaScriptReferences, analyzeReferences, } from "./reference-analysis-public.js";
export declare const analyzeJavaScriptReferencesWithinBoundary: typeof boundary.analyzeJavaScriptReferencesWithinBoundary;
export { markUnresolvedCandidateEvidence, regradeVestigialEdges, unsupportedCandidateReferenceGraph, } from "./reference-analysis-candidate-evidence.js";
export { DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES, } from "./reference-analysis-limits.js";
export { readBoundedReferenceSources } from "./reference-read-bounded.js";
export { readReferenceSources } from "./reference-read-basic.js";
export { readStableReferenceSources } from "./reference-read-stable.js";
export type { BoundedReferenceReadResult, ReferenceAnalysisResult, ReferenceCandidate, ReferenceContainmentBoundary, ReferenceReadResult, ReferenceSourceContent, ReferenceSourceMetadataReader, ReferenceSourceReader, ReferenceSourceSnapshot, StableReferenceSourceRead, StableReferenceSourceReader, StableReferenceSourceBoundary, } from "./reference-analysis-types/index.js";
