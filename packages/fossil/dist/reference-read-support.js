export { emptyReferenceGraph, finishBoundedReferenceRead, sortReferenceReadEvidence, } from "./reference-read-evidence.js";
const UNREADABLE_REFERENCE_WARNING = {
    code: "reference_unreadable",
    message: "Reference source could not be read.",
};
const BINARY_REFERENCE_WARNING = {
    code: "reference_binary",
    message: "Reference source is binary.",
};
export function addReferenceWarning(input) {
    input.unavailablePaths.push(input.source.path);
    input.warnings.push({
        code: input.code,
        message: input.message,
        path: input.source.path,
    });
}
function addTypedReferenceWarning(input) {
    addReferenceWarning(input);
}
export function addUnreadableReferenceWarning(input) {
    addTypedReferenceWarning({
        ...input,
        ...UNREADABLE_REFERENCE_WARNING,
    });
}
export function addBinaryReferenceWarning(input) {
    addTypedReferenceWarning(Object.assign({}, input, BINARY_REFERENCE_WARNING));
}
export function newReferenceReadCollections() {
    return {
        readableSources: [],
        unavailablePaths: [],
        warnings: [],
    };
}
export function newReferenceReadBudget() {
    return { acceptedBytes: 0, totalLimitReached: false };
}
//# sourceMappingURL=reference-read-support.js.map