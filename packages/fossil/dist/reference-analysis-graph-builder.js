import { strengthForReference } from "./reference-analysis-strength.js";
export function referenceGraph(parsed, sources) {
    const paths = new Set(sources.map((source) => source.path));
    const resolved = parsed.map((reference) => ({
        reference,
        targetPath: reference.targetPath ??
            (reference.language === "csharp"
                ? undefined
                : reference.targetCandidates.find((candidate) => paths.has(candidate))),
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
        .map(({ reference: { sourcePath, targetCandidates: candidates, language, kind, span, resolution } }) => ({
        sourcePath,
        targetCandidates: candidates,
        language,
        kind,
        span,
        resolution: resolution === "external" ? "external" : "unresolved",
    }));
    return { edges, unresolved, complete: true, unavailablePaths: [] };
}
//# sourceMappingURL=reference-analysis-graph-builder.js.map