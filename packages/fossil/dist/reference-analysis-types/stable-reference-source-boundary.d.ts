import type { ReferenceCandidate } from "./reference-candidate.js";
import type { ReferenceSourceReader } from "./reference-source-reader.js";
import type { ReferenceSourceSnapshot } from "./reference-source-snapshot.js";
export interface StableReferenceSourceBoundary {
    readonly inspect: (source: ReferenceCandidate) => ReferenceSourceSnapshot | undefined;
    readonly read: ReferenceSourceReader;
}
