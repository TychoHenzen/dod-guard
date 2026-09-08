/** Public compatibility boundary for the reference-analysis module. */
export {
  analyzeJavaScriptReferences,
  analyzeJavaScriptReferencesWithinBoundary,
  analyzeReferences,
  DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES,
  DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES,
  markUnresolvedCandidateEvidence,
  readBoundedReferenceSources,
  readReferenceSources,
  readStableReferenceSources,
  regradeVestigialEdges,
  unsupportedCandidateReferenceGraph,
} from "./reference-analysis-core.js";
export type { BoundedReferenceReadResult } from "./reference-analysis-core.js";
export type { ReferenceAnalysisResult } from "./reference-analysis-core.js";
export type { ReferenceCandidate } from "./reference-analysis-core.js";
export type {
  ReferenceContainmentBoundary,
} from "./reference-analysis-core.js";
export type { ReferenceReadResult } from "./reference-analysis-core.js";
export type { ReferenceSourceContent } from "./reference-analysis-core.js";
export type {
  ReferenceSourceMetadataReader,
} from "./reference-analysis-core.js";
export type { ReferenceSourceReader } from "./reference-analysis-core.js";
export type { ReferenceSourceSnapshot } from "./reference-analysis-core.js";
export type {
  StableReferenceSourceBoundary,
} from "./reference-analysis-core.js";
