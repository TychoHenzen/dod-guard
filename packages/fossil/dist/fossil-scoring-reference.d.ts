import type { ReferenceGraph } from "./types.js";
import type { CandidateReferenceSubscores } from "./fossil-scoring-types.js";
/** Scores how little strong inbound evidence a candidate receives. */
export declare function referenceWeaknessScore(candidatePath: string, graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): number;
/** Scores the fraction of unique resolved neighbors that are candidates. */
export declare function clusterIsolationScore(candidatePath: string, graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): number;
/** Derives both reference subscores, omitting both for incomplete evidence. */
export declare function candidateReferenceSubscores(candidatePath: string, graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): CandidateReferenceSubscores;
