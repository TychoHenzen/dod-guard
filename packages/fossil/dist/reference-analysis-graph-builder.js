import { strengthForReference } from "./reference-analysis-strength.js";
function resolvedTarget(reference, paths) {
    if (reference.targetPath !== undefined)
        return reference.targetPath;
    if (reference.language === "csharp")
        return undefined;
    return reference.targetCandidates.find((candidate) => paths.has(candidate));
}
function unresolvedReference({ reference: { sourcePath, targetCandidates: candidates, language, kind, span, resolution }, targetPath, }) {
    return {
        sourcePath,
        targetCandidates: candidates,
        language,
        kind,
        span,
        resolution: resolution === "external" ? "external" : "unresolved",
    };
}
export function referenceGraph(parsed, sources) {
    const paths = new Set(sources.map((source) => source.path));
    const resolved = parsed.map((reference) => ({
        reference,
        targetPath: resolvedTarget(reference, paths),
    }));
    const edges = resolved
        .filter((entry) => entry.targetPath !== undefined)
        .map(({ reference, targetPath }) => ({
        sourcePath: reference.sourcePath,
        targetPath: targetPath ?? "",
        language: reference.language,
        kind: reference.kind,
        strength: strengthForReference(reference, sources),
        span: reference.span,
    }));
    const unresolved = resolved
        .filter((entry) => entry.targetPath === undefined)
        .map(unresolvedReference);
    return { edges, unresolved, complete: true, unavailablePaths: [] };
}
//# sourceMappingURL=reference-analysis-graph-builder.js.map