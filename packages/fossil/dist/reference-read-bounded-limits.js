import { addReferenceWarning, } from "./reference-read-support.js";
function contentLimit(input) {
    addReferenceWarning({
        ...input.collections,
        source: input.source,
        code: "reference_content_limit",
        message: input.message,
    });
}
export function totalLimitReached(input) {
    if (input.budget.totalLimitReached ||
        input.budget.acceptedBytes >= input.maximumTotalBytes) {
        contentLimit({
            collections: input.collections,
            source: input.source,
            message: "Reference source exceeds the total content limit.",
        });
        return true;
    }
    return false;
}
export function metadataWithinLimits(input, byteLength) {
    if (byteLength > input.maximumFileBytes) {
        contentLimit({
            collections: input.collections,
            source: input.source,
            message: "Reference source exceeds the per-file content limit.",
        });
        return false;
    }
    if (input.budget.acceptedBytes + byteLength > input.maximumTotalBytes) {
        contentLimit({
            collections: input.collections,
            source: input.source,
            message: "Reference source exceeds the total content limit.",
        });
        input.budget.totalLimitReached = true;
        return false;
    }
    return true;
}
//# sourceMappingURL=reference-read-bounded-limits.js.map