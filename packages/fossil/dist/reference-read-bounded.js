import { DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES, } from "./reference-analysis-limits.js";
import { readBoundedSource } from "./reference-read-bounded-source.js";
import { finishBoundedReferenceRead, newReferenceReadBudget, newReferenceReadCollections, } from "./reference-read-support.js";
function configuredLimits(input) {
    return {
        maximumFileBytes: input.maximumFileBytes ?? DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES,
        maximumTotalBytes: input.maximumTotalBytes ?? DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES,
    };
}
/** Reads sources below byte limits while preserving unavailable evidence. */
export function readBoundedReferenceSources(input) {
    const collections = newReferenceReadCollections();
    const budget = newReferenceReadBudget();
    const { maximumFileBytes, maximumTotalBytes } = configuredLimits(input);
    for (const source of input.sources) {
        readBoundedSource({
            source,
            readMetadata: input.readMetadata,
            readSource: input.readSource,
            maximumFileBytes,
            maximumTotalBytes,
            budget,
            collections,
        });
    }
    return finishBoundedReferenceRead({
        ...collections,
        acceptedBytes: budget.acceptedBytes,
    });
}
//# sourceMappingURL=reference-read-bounded.js.map