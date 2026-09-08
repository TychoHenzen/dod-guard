import { DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES, } from "./reference-analysis-limits.js";
import { finishBoundedReferenceRead, newReferenceReadBudget, newReferenceReadCollections, } from "./reference-read-support.js";
import { hasStableCapacity, initialWithinLimits, inspectCurrentSnapshot, inspectInitialSnapshot, } from "./reference-read-stable-preflight.js";
import { readStableContent } from "./reference-read-stable-content.js";
function readStableSource(input) {
    if (!hasStableCapacity(input))
        return;
    const initial = inspectInitialSnapshot(input);
    if (!initial)
        return;
    if (!initialWithinLimits(input, initial))
        return;
    const current = inspectCurrentSnapshot(input, initial);
    if (!current)
        return;
    readStableContent(input, initial);
}
/** Reads stable regular files after re-checking their identity and path. */
export function readStableReferenceSourcesInternal({ sources, boundary, maximumFileBytes = DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, maximumTotalBytes = DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES, }) {
    const collections = newReferenceReadCollections();
    const budget = newReferenceReadBudget();
    sources.forEach((source) => {
        readStableSource({
            source,
            boundary,
            maximumFileBytes,
            maximumTotalBytes,
            budget,
            collections,
        });
    });
    return finishBoundedReferenceRead({
        ...collections,
        acceptedBytes: budget.acceptedBytes,
    });
}
//# sourceMappingURL=reference-read-stable.js.map