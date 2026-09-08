import type { BoundedReferenceReadResult } from "./reference-analysis-types/bounded-reference-read-result.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { ReferenceSourceMetadataReader } from "./reference-analysis-types/reference-source-metadata-reader.js";
import type { ReferenceSourceReader } from "./reference-analysis-types/reference-source-reader.js";
/** Reads sources below a per-file byte limit while preserving unavailable reference evidence for skipped files. */
export declare function readBoundedReferenceSources({ sources, readMetadata, readSource, maximumFileBytes, maximumTotalBytes, }: {
    sources: readonly ReferenceCandidate[];
    readMetadata: ReferenceSourceMetadataReader;
    readSource: ReferenceSourceReader;
    maximumFileBytes?: number;
    maximumTotalBytes?: number;
}): BoundedReferenceReadResult;
