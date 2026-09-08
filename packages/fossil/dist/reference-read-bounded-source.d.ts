import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { ReferenceSourceMetadataReader } from "./reference-analysis-types/reference-source-metadata-reader.js";
import type { ReferenceSourceReader } from "./reference-analysis-types/reference-source-reader.js";
export declare function readBoundedSource(input: {
    source: ReferenceCandidate;
    readMetadata: ReferenceSourceMetadataReader;
    readSource: ReferenceSourceReader;
    maximumFileBytes: number;
    maximumTotalBytes: number;
    budget: ReturnType<typeof import("./reference-read-support.js").newReferenceReadBudget>;
    collections: ReturnType<typeof import("./reference-read-support.js").newReferenceReadCollections>;
}): void;
