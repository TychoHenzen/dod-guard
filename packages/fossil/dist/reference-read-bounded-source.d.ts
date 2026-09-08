import type { ReferenceCandidate, ReferenceSourceMetadataReader, ReferenceSourceReader } from "./reference-analysis-types/index.js";
export declare function readBoundedSource(input: {
    source: ReferenceCandidate;
    readMetadata: ReferenceSourceMetadataReader;
    readSource: ReferenceSourceReader;
    maximumFileBytes: number;
    maximumTotalBytes: number;
    budget: ReturnType<typeof import("./reference-read-support.js").newReferenceReadBudget>;
    collections: ReturnType<typeof import("./reference-read-support.js").newReferenceReadCollections>;
}): void;
