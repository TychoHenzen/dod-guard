/** Public compatibility boundary for the reference-analysis module. */
export { analyzeJavaScriptReferences, analyzeJavaScriptReferencesWithinBoundary, analyzeReferences, DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES, markUnresolvedCandidateEvidence, readBoundedReferenceSources, readReferenceSources, readStableReferenceSources, regradeVestigialEdges, unsupportedCandidateReferenceGraph, } from "./reference-analysis-core.js";
export type * from "./reference-analysis-types/public.js";
