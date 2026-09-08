import type { BoundedReferenceReadResult } from "./reference-analysis-types/bounded-reference-read-result.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { StableReferenceSourceBoundary } from "./reference-analysis-types/stable-reference-source-boundary.js";
/** Reads stable regular files after re-checking their identity, type, and canonical path. */
export declare function readStableReferenceSources({ sources, boundary, maximumFileBytes, maximumTotalBytes, }: {
    sources: readonly ReferenceCandidate[];
    boundary: StableReferenceSourceBoundary;
    maximumFileBytes?: number;
    maximumTotalBytes?: number;
}): BoundedReferenceReadResult;
