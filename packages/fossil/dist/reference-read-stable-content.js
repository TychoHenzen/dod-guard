import { addBinaryReferenceWarning, addReferenceWarning, } from "./reference-read-support.js";
function maximumReadableBytes(input) {
    return Math.min(input.maximumFileBytes, input.maximumTotalBytes - input.budget.acceptedBytes);
}
function normalizeStableRead(result) {
    if (typeof result === "string")
        return { content: result, byteLength: Buffer.byteLength(result) };
    return result;
}
function isInvalidByteLength(byteLength, maximumBytes) {
    return (!Number.isSafeInteger(byteLength) ||
        byteLength < 0 ||
        byteLength > maximumBytes);
}
function addContentLimitWarning(input) {
    addReferenceWarning({
        ...input.collections,
        source: input.source,
        code: "reference_content_limit",
        message: "Reference source exceeds the bounded read limit.",
    });
}
function addUnreadableWarning(input) {
    addReferenceWarning({
        ...input.collections,
        source: input.source,
        code: "reference_unreadable",
        message: "Reference source could not be read.",
    });
}
export function readStableContent(input, initial) {
    try {
        const maximumBytes = maximumReadableBytes(input);
        const result = normalizeStableRead(input.boundary.read(input.source, maximumBytes, initial));
        if (isInvalidByteLength(result.byteLength, maximumBytes)) {
            addContentLimitWarning(input);
            return;
        }
        if (result.content.includes("\0")) {
            addBinaryReferenceWarning({ ...input.collections, source: input.source });
            return;
        }
        input.collections.readableSources.push({
            ...input.source,
            content: result.content,
        });
        input.budget.acceptedBytes += result.byteLength;
    }
    catch {
        addUnreadableWarning(input);
    }
}
//# sourceMappingURL=reference-read-stable-content.js.map