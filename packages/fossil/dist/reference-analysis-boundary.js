import { posix } from "node:path";
import { parsedModuleReferences } from "./reference-analysis-module-parser.js";
import { outsideBoundaryWarning, isOutsideRepositoryPath, pathIsWithin, compareText, } from "./reference-analysis-paths.js";
import { referenceGraph } from "./reference-analysis-graph-builder.js";
function needsBoundaryCheck(reference) {
    return (reference.resolution === "unresolved" &&
        Boolean(reference.targetCandidates[0]));
}
function recordOutsideBoundaryWarning(warnings, sourcePath) {
    warnings.set(sourcePath, outsideBoundaryWarning(sourcePath));
}
function referenceInsideBoundary(input) {
    const { reference, inventory, boundary, warnings } = input;
    const literalTarget = reference.targetCandidates[0];
    if (isOutsideRepositoryPath(literalTarget)) {
        recordOutsideBoundaryWarning(warnings, reference.sourcePath);
        return false;
    }
    const resolvedTarget = reference.targetCandidates.find((candidate) => inventory.has(candidate));
    if (!resolvedTarget)
        return true;
    const canonicalTarget = boundary.canonicalize(posix.join(boundary.canonicalRepositoryRoot, resolvedTarget));
    return pathIsWithin(boundary.canonicalRepositoryRoot, canonicalTarget);
}
function safeReference(input) {
    const { reference, inventory, boundary, warnings } = input;
    if (!needsBoundaryCheck(reference))
        return true;
    if (referenceInsideBoundary({ reference, inventory, boundary, warnings }))
        return true;
    recordOutsideBoundaryWarning(warnings, reference.sourcePath);
    return false;
}
/** Parses JavaScript references while enforcing the repository boundary. */
export function analyzeJavaScriptReferencesWithinBoundary(sources, boundary) {
    const inventory = new Set(sources.map((source) => source.path));
    const warnings = new Map();
    const safeReferences = sources
        .flatMap(parsedModuleReferences)
        .filter((reference) => safeReference({ reference, inventory, boundary, warnings }));
    return {
        graph: referenceGraph(safeReferences, sources),
        warnings: [...warnings.values()].sort((left, right) => compareText(left.path ?? "", right.path ?? "")),
    };
}
//# sourceMappingURL=reference-analysis-boundary.js.map