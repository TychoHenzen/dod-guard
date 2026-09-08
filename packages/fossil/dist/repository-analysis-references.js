import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { analyzeReferences, markUnresolvedCandidateEvidence, readStableReferenceSources, regradeVestigialEdges, unsupportedCandidateReferenceGraph, } from "./ref-analyzer.js";
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
function inspectReferenceSource(root, source) {
    const fullPath = join(root, source.path);
    const metadata = lstatSync(fullPath);
    return {
        identity: `${metadata.dev}:${metadata.ino}`,
        isRegularFile: metadata.isFile(),
        byteLength: metadata.size,
        canonicalPath: realpathSync(fullPath),
    };
}
function referenceCandidates(paths) {
    return paths.map((path) => ({
        path,
        language: languageForPath(path),
    }));
}
function readReferenceSources(root, candidates) {
    const supported = candidates.filter((candidate) => candidate.language !== "unsupported");
    const readSource = (source) => readFileSync(join(root, source.path), "utf8");
    const reads = readStableReferenceSources({
        sources: supported,
        boundary: {
            inspect: (source) => inspectReferenceSource(root, source),
            read: readSource,
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