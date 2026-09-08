import { addBinaryReferenceWarning, addUnreadableReferenceWarning, } from "./reference-read-support.js";
import { metadataWithinLimits, totalLimitReached, } from "./reference-read-bounded-limits.js";
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
        addUnreadableReferenceWarning({
            ...input.collections,
            source: input.source,
        });
    }
}
//# sourceMappingURL=reference-read-bounded-source.js.map