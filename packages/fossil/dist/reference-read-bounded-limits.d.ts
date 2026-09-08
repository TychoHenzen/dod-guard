import type { ReferenceCandidate } from "./reference-analysis-types.js";
import { newReferenceReadBudget, newReferenceReadCollections } from "./reference-read-support.js";
type ReferenceReadLimitsInput = {
    budget: ReturnType<typeof newReferenceReadBudget>;
    maximumTotalBytes: number;
    maximumFileBytes: number;
    collections: ReturnType<typeof newReferenceReadCollections>;
    source: ReferenceCandidate;
};
export declare function totalLimitReached(input: Omit<ReferenceReadLimitsInput, "maximumFileBytes">): boolean;
export declare function metadataWithinLimits(input: ReferenceReadLimitsInput, byteLength: number): boolean;
export {};
