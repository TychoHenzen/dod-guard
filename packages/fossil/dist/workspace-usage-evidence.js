import { posix } from "node:path";
export function normalizedRepositoryPath(path) {
    return posix.normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "");
}
export function basename(path) {
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
export function hasGraphUsage(graph, candidate) {
    return graph.edges.some((edge) => edgeTargetsCandidate(edge, candidate));
}
function valueUsesCandidate(input) {
    if (input.value === input.candidate)
        return true;
    return input.basenameCount === 1 && input.value === input.candidateBasename;
}
export function sourceUsesCandidate(input) {
    if (normalizedRepositoryPath(input.source.path) === input.candidate)
        return false;
    return sourceStringValues(input.source.content).some((value) => valueUsesCandidate({ ...input, value }));
}
//# sourceMappingURL=workspace-usage-evidence.js.map