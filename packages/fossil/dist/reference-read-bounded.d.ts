import type { BoundedReferenceReadResult, ReferenceCandidate, ReferenceSourceMetadataReader, ReferenceSourceReader } from "./reference-analysis-types/index.js";
interface ReadBoundedReferenceSourcesInput {
    sources: readonly ReferenceCandidate[];
    readMetadata: ReferenceSourceMetadataReader;
    readSource: ReferenceSourceReader;
    maximumFileBytes?: number;
    maximumTotalBytes?: number;
}
/** Reads sources below byte limits while preserving unavailable evidence. */
export declare function readBoundedReferenceSources(input: ReadBoundedReferenceSourcesInput): BoundedReferenceReadResult;
export {};
