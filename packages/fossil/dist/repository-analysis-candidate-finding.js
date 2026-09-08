import { abandonmentScore, candidateReferenceSubscores, createAdvisoryFossilFinding, normalizedBurstChurn, scoreFossilSubscores, } from "./fossil-grader.js";
function scoreSubscores(input) {
    const reference = candidateReferenceSubscores(input.candidate.path, input.graph, input.candidatePaths);
    const base = {
        churn: normalizedBurstChurn(input.candidate, input.burst.files),
        abandonment: abandonmentScore(input.candidate),
    };
    const subscores = reference.available
        ? { ...base, referenceWeakness: reference.referenceWeakness, clusterIsolation: reference.clusterIsolation }
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
function strongInboundCount(graph, path, candidatePaths) {
    return new Set(graph.edges.filter((edge) => isStrongInbound(edge, path, candidatePaths)).map((edge) => edge.sourcePath)).size;
}
function neighborPaths(graph, path) {
    const neighbors = new Set();
    for (const edge of graph.edges) {
        if (edge.sourcePath === path)
            neighbors.add(edge.targetPath);
        if (edge.targetPath === path)
            neighbors.add(edge.sourcePath);
    }
    return neighbors;
}
function selectedNeighbors(neighbors, candidatePaths, selected) {
    return [...neighbors].filter((path) => candidatePaths.has(path) === selected).sort();
}
function referenceAvailability(available) {
    if (available)
        return "complete";
    return "unavailable";
}
export function candidateFinding(input) {
    const scored = scoreSubscores(input);
    if (!(scored.score && scored.score.score >= input.threshold))
        return [];
    const neighbors = neighborPaths(input.graph, input.candidate.path);
    return [
        createAdvisoryFossilFinding({
            burstId: input.burst.id,
            path: input.candidate.path,
            activity: input.candidate,
            score: scored.score.score,
            scoreBasis: scored.score.basis,
            subscores: scored.subscores,
            referenceAvailability: referenceAvailability(scored.reference.available),
            strongInboundReferences: strongInboundCount(input.graph, input.candidate.path, input.candidatePaths),
            candidateNeighbors: selectedNeighbors(neighbors, input.candidatePaths, true),
            liveNeighbors: selectedNeighbors(neighbors, input.candidatePaths, false),
        }),
    ];
}
//# sourceMappingURL=repository-analysis-candidate-finding.js.map