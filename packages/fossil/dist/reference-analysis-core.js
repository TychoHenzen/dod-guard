/** Public compatibility boundary for reference-analysis helpers. */
export { analyzeJavaScriptReferences, analyzeReferences, } from "./reference-analysis-public.js";
export { analyzeJavaScriptReferencesWithinBoundary, } from "./reference-analysis-boundary.js";
export { markUnresolvedCandidateEvidence, regradeVestigialEdges, unsupportedCandidateReferenceGraph, } from "./reference-analysis-candidate-evidence.js";
export { DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES, } from "./reference-analysis-limits.js";
export { readBoundedReferenceSources } from "./reference-read-bounded.js";
export { readReferenceSources } from "./reference-read-basic.js";
export { readStableReferenceSources } from "./reference-read-stable.js";
//# sourceMappingURL=reference-analysis-core.js.map