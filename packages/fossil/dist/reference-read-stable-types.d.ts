import type { ReferenceCandidate, StableReferenceSourceBoundary } from "./reference-analysis-types/index.js";
import type { newReferenceReadBudget, newReferenceReadCollections } from "./reference-read-support.js";
export interface StableReadInput {
    source: ReferenceCandidate;
    boundary: StableReferenceSourceBoundary;
    maximumFileBytes: number;
    maximumTotalBytes: number;
    budget: ReturnType<typeof newReferenceReadBudget>;
    collections: ReturnType<typeof newReferenceReadCollections>;
}
