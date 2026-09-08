import type { BoundedReferenceReadResult, ReferenceCandidate, StableReferenceSourceBoundary } from "./reference-analysis-types/index.js";
/** Reads stable regular files after re-checking their identity and path. */
export declare function readStableReferenceSources({ sources, boundary, maximumFileBytes, maximumTotalBytes, }: {
    sources: readonly ReferenceCandidate[];
    boundary: StableReferenceSourceBoundary;
    maximumFileBytes?: number;
    maximumTotalBytes?: number;
}): BoundedReferenceReadResult;
