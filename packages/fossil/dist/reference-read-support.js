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
export function addUnreadableReferenceWarning(input) {
    addReferenceWarning({
        ...input,
        code: "reference_unreadable",
        message: "Reference source could not be read.",
    });
}
export function sortReferenceReadEvidence(input) {
    input.unavailablePaths.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    input.warnings.sort((left, right) => {
        const leftPath = left.path ?? "";
        const rightPath = right.path ?? "";
        return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
    });
}
export function newReferenceReadCollections() {
    return { readableSources: [], unavailablePaths: [], warnings: [] };
}
export function newReferenceReadBudget() {
    return { acceptedBytes: 0, totalLimitReached: false };
}
export function boundedReferenceResult(input) {
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