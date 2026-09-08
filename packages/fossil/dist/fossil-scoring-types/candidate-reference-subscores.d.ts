/** Both reference subscores are available together, or neither is available. */
export type CandidateReferenceSubscores = {
    readonly available: true;
    readonly referenceWeakness: number;
    readonly clusterIsolation: number;
} | {
    readonly available: false;
    readonly referenceWeakness?: never;
    readonly clusterIsolation?: never;
};
