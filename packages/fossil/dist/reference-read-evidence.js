import { compareText } from "./reference-analysis-paths.js";
export function emptyReferenceGraph(unavailablePaths) {
    return {
        edges: [],
        unresolved: [],
        complete: unavailablePaths.length === 0,
        unavailablePaths,
    };
}
function warningPath(warning) {
    return warning.path ?? "";
}
function compareWarnings(left, right) {
    return compareText(warningPath(left), warningPath(right));
}
export function sortReferenceReadEvidence(input) {
    input.unavailablePaths.sort(compareText);
    input.warnings.sort(compareWarnings);
}
function boundedReferenceResult(input) {
    return {
        graph: emptyReferenceGraph(input.unavailablePaths),
        sources: input.readableSources,
        warnings: input.warnings,
        acceptedBytes: input.acceptedBytes,
    };
}
export function finishBoundedReferenceRead(input) {
    sortReferenceReadEvidence(input);
    return boundedReferenceResult(input);
}
//# sourceMappingURL=reference-read-evidence.js.map