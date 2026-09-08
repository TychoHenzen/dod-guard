import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { StableReferenceSourceBoundary } from "./reference-analysis-types/stable-reference-source-boundary.js";
import type { newReferenceReadBudget, newReferenceReadCollections } from "./reference-read-support.js";

export interface StableReadInput {
  source: ReferenceCandidate;
  boundary: StableReferenceSourceBoundary;
  maximumFileBytes: number;
  maximumTotalBytes: number;
  budget: ReturnType<typeof newReferenceReadBudget>;
  collections: ReturnType<typeof newReferenceReadCollections>;
}
