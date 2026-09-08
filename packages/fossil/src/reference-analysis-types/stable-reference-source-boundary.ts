import type { ReferenceCandidate } from "./reference-candidate.js";
import type { ReferenceSourceSnapshot } from "./reference-source-snapshot.js";

export interface StableReferenceSourceBoundary {
  readonly inspect: (
    source: ReferenceCandidate,
  ) => ReferenceSourceSnapshot | undefined;
  readonly read: (
    source: ReferenceCandidate,
    maximumBytes: number,
    expected: ReferenceSourceSnapshot,
  ) => string | { readonly content: string; readonly byteLength: number };
}
