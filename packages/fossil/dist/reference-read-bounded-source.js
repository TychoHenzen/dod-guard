import { addBinaryReferenceWarning, addReferenceWarning, addUnreadableReferenceWarning, } from "./reference-read-support.js";
function contentLimit(input) {
    addReferenceWarning({ ...input.collections, source: input.source, code: "reference_content_limit", message: input.message });
}
function totalLimitReached(input) {
    if (input.budget.totalLimitReached || input.budget.acceptedBytes >= input.maximumTotalBytes) {
        contentLimit({
            collections: input.collections,
            source: input.source,
            message: "Reference source exceeds the total content limit.",
        });
        return true;
    }
    return false;
}
function metadataWithinLimits(input, byteLength) {
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
function contentIsReadable(input, content) {
    if (content.includes("\0")) {
        addBinaryReferenceWarning({ ...input.collections, source: input.source });
        return false;
    }
    return true;
}
export function readBoundedSource(input) {
    if (totalLimitReached(input))
        return;
    try {
        const { byteLength } = input.readMetadata(input.source);
        if (!metadataWithinLimits(input, byteLength))
            return;
        const content = input.readSource(input.source);
        if (!contentIsReadable(input, content))
            return;
        input.collections.readableSources.push({ ...input.source, content });
        input.budget.acceptedBytes += byteLength;
    }
    catch {
        addUnreadableReferenceWarning({ ...input.collections, source: input.source });
    }
}
//# sourceMappingURL=reference-read-bounded-source.js.map