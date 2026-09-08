import type { ReferenceCandidate } from "./reference-candidate.js";
import type { ReferenceSourceSnapshot } from "./reference-source-snapshot.js";
type StableReferenceSourceRead = {
    readonly content: string;
    readonly byteLength: number;
};
type StableReferenceSourceReader = (source: ReferenceCandidate, maximumBytes: number, expected: ReferenceSourceSnapshot) => string | StableReferenceSourceRead;
export interface StableReferenceSourceBoundary {
    readonly inspect: (source: ReferenceCandidate) => ReferenceSourceSnapshot | undefined;
    readonly read: StableReferenceSourceReader;
}
export {};
