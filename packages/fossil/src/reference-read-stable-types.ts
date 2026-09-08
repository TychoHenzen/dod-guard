import type {
  ReferenceCandidate,
  ReferenceSourceSnapshot,
} from "./reference-analysis-types/index.js";
import type {
  newReferenceReadBudget,
  newReferenceReadCollections,
} from "./reference-read-support.js";

export interface StableReadInput {
  source: ReferenceCandidate;
  boundary: {
    readonly inspect: (
      source: ReferenceCandidate,
    ) => ReferenceSourceSnapshot | undefined;
    readonly read: (
      source: ReferenceCandidate,
      maximumBytes: number,
      expected: ReferenceSourceSnapshot,
    ) => string | { readonly content: string; readonly byteLength: number };
  };
  maximumFileBytes: number;
  maximumTotalBytes: number;
  budget: ReturnType<typeof newReferenceReadBudget>;
  collections: ReturnType<typeof newReferenceReadCollections>;
}
