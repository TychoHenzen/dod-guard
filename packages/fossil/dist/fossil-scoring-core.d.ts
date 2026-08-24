import type { BurstFileActivity, FossilFinding, FossilSubscores, ReferenceGraph, ScoreBasis } from "./types.js";
/** Numeric fossil score with the evidence basis used to compute it. */
export interface FossilScore {
    readonly score: number;
    readonly basis: ScoreBasis;
}
/** One scored candidate activity retained with its burst-specific evidence. */
export interface BurstCandidateEvidence {
    readonly burstId: string;
    readonly activity: BurstFileActivity;
    readonly score: FossilScore;
}
/** Required fossil-finding evidence excluding its fixed advisory classification. */
export type AdvisoryFossilFindingInput = Omit<FossilFinding, "classification">;
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
/** Normalizes one candidate's positive burst churn against the positive burst maximum. */
export declare function normalizedBurstChurn(candidate: BurstFileActivity, burstFiles: readonly BurstFileActivity[]): number;
/** Scores the absence of post-burst commits for one candidate. */
export declare function abandonmentScore(candidate: BurstFileActivity): number;
/** Scores how little strong inbound evidence a candidate receives from live source paths. */
export declare function referenceWeaknessScore(candidatePath: string, graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): number;
/** Scores the fraction of a candidate's unique resolved neighbors that are fossil candidates. */
export declare function clusterIsolationScore(candidatePath: string, graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): number;
/** Derives both reference subscores together, omitting both when candidate evidence is incomplete. */
export declare function candidateReferenceSubscores(candidatePath: string, graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): CandidateReferenceSubscores;
/** Combines all four available fossil subscores using the fixed full-evidence weights. */
export declare function scoreFossilSubscores(subscores: FossilSubscores): FossilScore | undefined;
/** Returns whether a score meets the inclusive fossil finding threshold. */
export declare function meetsFossilThreshold(score: number, threshold: number): boolean;
/** Retains every qualifying burst-specific candidate without deduplicating matching paths. */
export declare function qualifyingBurstCandidates(candidates: readonly BurstCandidateEvidence[], threshold: number): readonly BurstCandidateEvidence[];
/** Builds a fossil finding that remains advisory regardless of its score. */
export declare function createAdvisoryFossilFinding(input: AdvisoryFossilFindingInput): FossilFinding;
