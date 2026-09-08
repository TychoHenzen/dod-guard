import { abandonmentScore, candidateReferenceSubscores, normalizedBurstChurn, scoreFossilSubscores, } from "./fossil-grader.js";
export function scoreSubscores(input) {
    const reference = candidateReferenceSubscores(input.candidate.path, input.graph, input.candidatePaths);
    const base = {
        churn: normalizedBurstChurn(input.candidate, input.burst.files),
        abandonment: abandonmentScore(input.candidate),
    };
    const subscores = reference.available
        ? {
            ...base,
            referenceWeakness: reference.referenceWeakness,
            clusterIsolation: reference.clusterIsolation,
        }
        : base;
    return { reference, subscores, score: scoreFossilSubscores(subscores) };
}
function isStrongInbound(edge, path, candidatePaths) {
    if (edge.targetPath !== path)
        return false;
    if (edge.strength !== "strong")
        return false;
    return !candidatePaths.has(edge.sourcePath);
}
export function strongInboundCount(graph, path, candidatePaths) {
    return new Set(graph.edges
        .filter((edge) => isStrongInbound(edge, path, candidatePaths))
        .map((edge) => edge.sourcePath)).size;
}
export function neighborPaths(graph, path) {
    const neighbors = new Set();
    for (const edge of graph.edges) {
        if (edge.sourcePath === path)
            neighbors.add(edge.targetPath);
        if (edge.targetPath === path)
            neighbors.add(edge.sourcePath);
    }
    return neighbors;
}
export function selectedNeighbors(neighbors, candidatePaths, selected) {
    return [...neighbors]
        .filter((path) => candidatePaths.has(path) === selected)
        .sort();
}
export function referenceAvailability(available) {
    if (available)
        return "complete";
    return "unavailable";
}
//# sourceMappingURL=repository-analysis-candidate-scoring.js.map