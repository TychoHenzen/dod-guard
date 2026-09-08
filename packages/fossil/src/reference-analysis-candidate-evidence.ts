import type { ReferenceGraph } from "./types.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import { compareText } from "./reference-analysis-paths.js";
import { emptyReferenceGraph } from "./reference-read-support.js";
import { candidateBasenameCounts, markUnresolvedReference } from "./reference-analysis-candidate-matching.js";

/** Regrades current edges between two fossil candidates before scoring. */
export function regradeVestigialEdges(graph: ReferenceGraph, candidatePaths: ReadonlySet<string>): ReferenceGraph {
  return {
    ...graph,
    edges: graph.edges.map((edge) =>
      candidatePaths.has(edge.sourcePath) && candidatePaths.has(edge.targetPath)
        ? { ...edge, strength: "vestigial" }
        : { ...edge },
    ),
  };
}

/** Marks candidate reference evidence unavailable when unresolved paths could target it. */
export function markUnresolvedCandidateEvidence(
  graph: ReferenceGraph,
  candidatePaths: ReadonlySet<string>,
): ReferenceGraph {
  const candidates = [...candidatePaths];
  const basenameCounts = candidateBasenameCounts(candidates);
  const unavailable = new Set(graph.unavailablePaths);
  for (const unresolved of graph.unresolved)
    markUnresolvedReference({ unresolved, candidates, basenameCounts, unavailable });
  const unavailablePaths = [...unavailable].sort(compareText);
  return { ...graph, complete: graph.complete && unavailablePaths.length === 0, unavailablePaths };
}

/** Produces normalized unavailable evidence for candidates with no reference backend. */
export function unsupportedCandidateReferenceGraph(candidates: readonly ReferenceCandidate[]): ReferenceGraph {
  const unavailablePaths = [
    ...new Set(candidates.filter((candidate) => candidate.language === "unsupported").map((candidate) => candidate.path)),
  ].sort(compareText);
  return emptyReferenceGraph(unavailablePaths);
}
