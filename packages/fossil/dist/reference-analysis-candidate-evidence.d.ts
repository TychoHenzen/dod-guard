import type { ReferenceGraph } from "./types.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
/** Regrades current edges between two fossil candidates before scoring. */
export declare function regradeVestigialEdges(graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): ReferenceGraph;
/** Marks evidence unavailable when unresolved paths could target candidates. */
export declare function markUnresolvedCandidateEvidence(graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): ReferenceGraph;
/** Produces unavailable evidence for candidates without a reference backend. */
export declare function unsupportedCandidateReferenceGraph(candidates: readonly ReferenceCandidate[]): ReferenceGraph;
