import { analyzeReferences, markUnresolvedCandidateEvidence, readStableReferenceSourcesInternal, regradeVestigialEdges, unsupportedCandidateReferenceGraph, } from "./repository-analysis-reference-boundary.js";
import { inspectReferenceSource, readReferenceSource, } from "./reference-source-reader.js";
function languageForPath(path) {
    const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
    if ([".ts", ".tsx"].includes(extension))
        return "typescript";
    if ([".js", ".jsx", ".mjs", ".cjs"].includes(extension))
        return "javascript";
    if (extension === ".cs")
        return "csharp";
    if (extension === ".rs")
        return "rust";
    return "unsupported";
}
function referenceCandidates(paths) {
    return paths.map((path) => ({
        path,
        language: languageForPath(path),
    }));
}
function readReferenceSources(root, candidates) {
    const supported = candidates.filter((candidate) => candidate.language !== "unsupported");
    const reads = readStableReferenceSourcesInternal({
        sources: supported,
        boundary: {
            inspect: (source) => inspectReferenceSource(root, source),
            read: (source, maximumBytes, initial) => readReferenceSource({ root, source, maximumBytes, initial }),
        },
    });
    return reads;
}
function completeReferenceGraph(reads, unsupported) {
    const graph = analyzeReferences(reads.sources);
    return {
        ...graph,
        complete: reads.graph.complete && unsupported.complete,
        unavailablePaths: [
            ...new Set([
                ...reads.graph.unavailablePaths,
                ...unsupported.unavailablePaths,
            ]),
        ].sort(),
    };
}
export function referenceSources(root, paths) {
    const candidates = referenceCandidates(paths);
    const reads = readReferenceSources(root, candidates);
    const unsupported = unsupportedCandidateReferenceGraph(candidates);
    return {
        sources: reads.sources,
        warnings: reads.warnings,
        acceptedBytes: reads.acceptedBytes,
        graph: completeReferenceGraph(reads, unsupported),
    };
}
export { markUnresolvedCandidateEvidence, regradeVestigialEdges };
//# sourceMappingURL=repository-analysis-references.js.map