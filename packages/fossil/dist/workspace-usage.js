import { posix } from "node:path";
import { analyzeReferences } from "./ref-analyzer.js";
function normalizedRepositoryPath(path) {
    return posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "");
}
function basename(path) {
    return normalizedRepositoryPath(path).split("/").at(-1) ?? "";
}
function sourceStringValues(content) {
    const values = [];
    const matcher = /(["'`])([^"'`\r\n]+)\1/g;
    for (let match = matcher.exec(content); match; match = matcher.exec(content)) {
        const value = match[2];
        if (value !== undefined)
            values.push(normalizedRepositoryPath(value));
    }
    return values;
}
function edgeTargetsCandidate(edge, candidate) {
    if (normalizedRepositoryPath(edge.targetPath) !== candidate)
        return false;
    return normalizedRepositoryPath(edge.sourcePath) !== candidate;
}
function hasGraphUsage(graph, candidate) {
    return graph.edges.some((edge) => edgeTargetsCandidate(edge, candidate));
}
function valueUsesCandidate(value, candidate, candidateBasename, basenameCount) {
    if (value === candidate)
        return true;
    return basenameCount === 1 && value === candidateBasename;
}
function sourceUsesCandidate(source, candidate, candidateBasename, basenameCount) {
    if (normalizedRepositoryPath(source.path) === candidate)
        return false;
    return sourceStringValues(source.content).some((value) => valueUsesCandidate(value, candidate, candidateBasename, basenameCount));
}
/** Detects resolved imports and exact source-string evidence that an old workspace candidate is in use. */
export function hasInboundWorkspaceUsage(candidatePath, sources, inventoryPaths) {
    const normalizedCandidate = normalizedRepositoryPath(candidatePath);
    const graph = analyzeReferences(sources);
    if (hasGraphUsage(graph, normalizedCandidate))
        return true;
    const candidateBasename = basename(normalizedCandidate);
    const normalizedInventory = new Set([...inventoryPaths, candidatePath].map(normalizedRepositoryPath));
    const basenameCount = [...normalizedInventory].filter((path) => basename(path) === candidateBasename).length;
    return sources.some((source) => sourceUsesCandidate(source, normalizedCandidate, candidateBasename, basenameCount));
}
/** Omits workspace candidates when any inbound repository-contained usage evidence is found. */
export function omitUsedWorkspaceCandidates(candidates, sources, inventoryPaths) {
    return candidates.filter((candidate) => !hasInboundWorkspaceUsage(candidate.path, sources, inventoryPaths));
}
//# sourceMappingURL=workspace-usage.js.map