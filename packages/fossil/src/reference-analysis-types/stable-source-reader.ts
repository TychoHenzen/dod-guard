import type { ReferenceCandidate } from "./reference-candidate.js";
import type { ReferenceSourceSnapshot } from "./reference-source-snapshot.js";
import type { StableReferenceSourceRead } from "./stable-source-read.js";

export type StableReferenceSourceReader = (
  source: ReferenceCandidate,
  maximumBytes: number,
  expected: ReferenceSourceSnapshot,
) => string | StableReferenceSourceRead;
