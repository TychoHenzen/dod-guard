/** Public compatibility boundary for reference-analysis helpers. */
import * as boundary from "./reference-analysis-boundary.js";
import type {
  BoundedReferenceReadResult,
  ReferenceCandidate,
  StableReferenceSourceBoundary,
} from "./reference-analysis-types/index.js";
import { readStableReferenceSourcesInternal } from "./reference-read-stable.js";

export {
  analyzeJavaScriptReferences,
  analyzeReferences,
} from "./reference-analysis-public.js";
export const analyzeJavaScriptReferencesWithinBoundary =
  boundary.analyzeJavaScriptReferencesWithinBoundary;
export {
  markUnresolvedCandidateEvidence,
  regradeVestigialEdges,
  unsupportedCandidateReferenceGraph,
} from "./reference-analysis-candidate-evidence.js";
export {
  DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES,
  DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES,
} from "./reference-analysis-limits.js";
export { readBoundedReferenceSources } from "./reference-read-bounded.js";
export { readReferenceSources } from "./reference-read-basic.js";
export function readStableReferenceSources({
  sources,
  boundary,
  maximumFileBytes,
  maximumTotalBytes,
}: {
  sources: readonly ReferenceCandidate[];
  boundary: StableReferenceSourceBoundary;
  maximumFileBytes?: number;
  maximumTotalBytes?: number;
}): BoundedReferenceReadResult {
  return readStableReferenceSourcesInternal({
    sources,
    boundary: {
      inspect: boundary.inspect,
      read: (source) => boundary.read(source),
    },
    maximumFileBytes,
    maximumTotalBytes,
  });
}
export type {
  BoundedReferenceReadResult,
  ReferenceAnalysisResult,
  ReferenceCandidate,
  ReferenceContainmentBoundary,
  ReferenceReadResult,
  ReferenceSourceContent,
  ReferenceSourceMetadataReader,
  ReferenceSourceReader,
  ReferenceSourceSnapshot,
  StableReferenceSourceBoundary,
} from "./reference-analysis-types/index.js";
