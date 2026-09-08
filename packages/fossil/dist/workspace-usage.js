import { analyzeReferences, } from "./ref-analyzer.js";
import { basename, hasGraphUsage, normalizedRepositoryPath, sourceUsesCandidate, } from "./workspace-usage-evidence.js";
/** Detects imports and exact source-string usage evidence. */
export function hasInboundWorkspaceUsage(candidatePath, sources, inventoryPaths) {
    const normalizedCandidate = normalizedRepositoryPath(candidatePath);
    const graph = analyzeReferences(sources);
    if (hasGraphUsage(graph, normalizedCandidate))
        return true;
    const candidateBasename = basename(normalizedCandidate);
    const normalizedInventory = new Set([...inventoryPaths, candidatePath].map(normalizedRepositoryPath));
    const basenameCount = [...normalizedInventory].filter((path) => basename(path) === candidateBasename).length;
    return sources.some((source) => sourceUsesCandidate({
        source,
        candidate: normalizedCandidate,
        candidateBasename,
        basenameCount,
    }));
}
/** Omits candidates with inbound repository-contained usage evidence. */
export function omitUsedWorkspaceCandidates(candidates, sources, inventoryPaths) {
    return candidates.filter((candidate) => !hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths));
}
//# sourceMappingURL=workspace-usage.js.map