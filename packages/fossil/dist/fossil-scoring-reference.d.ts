import type { ReferenceGraph } from "./types.js";
import type { CandidateReferenceSubscores } from "./fossil-scoring-types/candidate-reference-subscores.js";
/** Scores how little strong inbound evidence a candidate receives from live source paths. */
export declare function referenceWeaknessScore(candidatePath: string, graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): number;
/** Scores the fraction of a candidate's unique resolved neighbors that are fossil candidates. */
export declare function clusterIsolationScore(candidatePath: string, graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): number;
/** Derives both reference subscores together, omitting both when candidate evidence is incomplete. */
export declare function candidateReferenceSubscores(candidatePath: string, graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): CandidateReferenceSubscores;
