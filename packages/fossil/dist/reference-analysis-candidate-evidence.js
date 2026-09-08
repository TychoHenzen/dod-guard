import { compareText } from "./reference-analysis-paths.js";
import { emptyReferenceGraph } from "./reference-read-support.js";
import { candidateBasenameCounts, markUnresolvedReference } from "./reference-analysis-candidate-matching.js";
/** Regrades current edges between two fossil candidates before scoring. */
export function regradeVestigialEdges(graph, candidatePaths) {
    return {
        ...graph,
        edges: graph.edges.map((edge) => candidatePaths.has(edge.sourcePath) && candidatePaths.has(edge.targetPath)
            ? { ...edge, strength: "vestigial" }
            : { ...edge }),
    };
}
/** Marks candidate reference evidence unavailable when unresolved paths could target it. */
export function markUnresolvedCandidateEvidence(graph, candidatePaths) {
    const candidates = [...candidatePaths];
    const basenameCounts = candidateBasenameCounts(candidates);
    const unavailable = new Set(graph.unavailablePaths);
    for (const unresolved of graph.unresolved)
        markUnresolvedReference(unresolved, candidates, basenameCounts, unavailable);
    const unavailablePaths = [...unavailable].sort(compareText);
    return { ...graph, complete: graph.complete && unavailablePaths.length === 0, unavailablePaths };
}
/** Produces normalized unavailable evidence for candidates with no reference backend. */
export function unsupportedCandidateReferenceGraph(candidates) {
    const unavailablePaths = [
        ...new Set(candidates.filter((candidate) => candidate.language === "unsupported").map((candidate) => candidate.path)),
    ].sort(compareText);
    return emptyReferenceGraph(unavailablePaths);
}
//# sourceMappingURL=reference-analysis-candidate-evidence.js.map