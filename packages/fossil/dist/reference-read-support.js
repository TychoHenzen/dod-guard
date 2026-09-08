import { compareText } from "./reference-analysis-paths.js";
export function emptyReferenceGraph(unavailablePaths) {
    return {
        edges: [],
        unresolved: [],
        complete: unavailablePaths.length === 0,
        unavailablePaths,
    };
}
export function addReferenceWarning(input) {
    input.unavailablePaths.push(input.source.path);
    input.warnings.push({ code: input.code, message: input.message, path: input.source.path });
}
function addTypedReferenceWarning(input) {
    addReferenceWarning(input);
}
export function addUnreadableReferenceWarning(input) {
    addTypedReferenceWarning({
        ...input,
        code: "reference_unreadable",
        message: "Reference source could not be read.",
    });
}
export function addBinaryReferenceWarning(input) {
    addTypedReferenceWarning({
        ...input,
        code: "reference_binary",
        message: "Reference source is binary.",
    });
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
export function newReferenceReadCollections() {
    return { readableSources: [], unavailablePaths: [], warnings: [] };
}
export function newReferenceReadBudget() {
    return { acceptedBytes: 0, totalLimitReached: false };
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
//# sourceMappingURL=reference-read-support.js.map