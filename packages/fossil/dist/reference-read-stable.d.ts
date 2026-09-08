import type { BoundedReferenceReadResult, ReferenceCandidate } from "./reference-analysis-types/index.js";
import type { StableReadInput } from "./reference-read-stable-types.js";
/** Reads stable regular files after re-checking their identity and path. */
export declare function readStableReferenceSourcesInternal({ sources, boundary, maximumFileBytes, maximumTotalBytes, }: {
    sources: readonly ReferenceCandidate[];
    boundary: StableReadInput["boundary"];
    maximumFileBytes?: number;
    maximumTotalBytes?: number;
}): BoundedReferenceReadResult;
