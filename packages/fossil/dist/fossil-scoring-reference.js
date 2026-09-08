function isLiveStrongInbound(candidatePath, candidatePaths, edge) {
    return (edge.targetPath === candidatePath &&
        edge.sourcePath !== candidatePath &&
        edge.strength === "strong" &&
        !candidatePaths.has(edge.sourcePath));
}
/** Scores how little strong inbound evidence a candidate receives. */
export function referenceWeaknessScore(candidatePath, graph, candidatePaths) {
    const liveInboundSources = new Set(graph.edges
        .filter((edge) => isLiveStrongInbound(candidatePath, candidatePaths, edge))
        .map((edge) => edge.sourcePath));
    if (liveInboundSources.size === 0)
        return 1;
    return liveInboundSources.size === 1 ? 0.5 : 0;
}
function addCandidateNeighbor(neighbors, candidatePath, edge) {
    if (edge.sourcePath === candidatePath && edge.targetPath !== candidatePath)
        neighbors.add(edge.targetPath);
    if (edge.targetPath === candidatePath && edge.sourcePath !== candidatePath)
        neighbors.add(edge.sourcePath);
}
/** Scores the fraction of unique resolved neighbors that are candidates. */
export function clusterIsolationScore(candidatePath, graph, candidatePaths) {
    const neighbors = new Set();
    for (const edge of graph.edges)
        addCandidateNeighbor(neighbors, candidatePath, edge);
    if (neighbors.size === 0)
        return 1;
    return ([...neighbors].filter((neighbor) => candidatePaths.has(neighbor)).length /
        neighbors.size);
}
/** Derives both reference subscores, omitting both for incomplete evidence. */
export function candidateReferenceSubscores(candidatePath, graph, candidatePaths) {
    if (!graph.complete || graph.unavailablePaths.includes(candidatePath))
        return { available: false };
    return {
        available: true,
        referenceWeakness: referenceWeaknessScore(candidatePath, graph, candidatePaths),
        clusterIsolation: clusterIsolationScore(candidatePath, graph, candidatePaths),
    };
}
//# sourceMappingURL=fossil-scoring-reference.js.map