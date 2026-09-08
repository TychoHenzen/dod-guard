import type { ReferenceCandidate } from "./reference-candidate.js";
import type { ReferenceSourceSnapshot } from "./reference-source-snapshot.js";
import type { StableReferenceSourceReader } from "./stable-source-reader.js";

export interface StableReferenceSourceBoundary {
  readonly inspect: (
    source: ReferenceCandidate,
  ) => ReferenceSourceSnapshot | undefined;
  readonly read: StableReferenceSourceReader;
}
