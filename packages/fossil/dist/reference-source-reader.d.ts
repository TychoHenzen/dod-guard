import type { ReferenceCandidate, ReferenceSourceSnapshot } from "./repository-analysis-reference-boundary.js";
export declare function inspectReferenceSource(root: string, source: ReferenceCandidate): ReferenceSourceSnapshot;
export declare function readReferenceSource({ root, source, maximumBytes, initial, }: {
    root: string;
    source: ReferenceCandidate;
    maximumBytes: number;
    initial: ReferenceSourceSnapshot;
}): {
    content: string;
    byteLength: number;
};
