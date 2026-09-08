import { DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES } from "./reference-analysis-limits.js";
import { readBoundedSource } from "./reference-read-bounded-source.js";
import { finishBoundedReferenceRead, newReferenceReadBudget, newReferenceReadCollections } from "./reference-read-support.js";
/** Reads sources below a per-file byte limit while preserving unavailable reference evidence for skipped files. */
export function readBoundedReferenceSources({ sources, readMetadata, readSource, maximumFileBytes = DEFAULT_MAXIMUM_REFERENCE_FILE_BYTES, maximumTotalBytes = DEFAULT_MAXIMUM_REFERENCE_TOTAL_BYTES, }) {
    const collections = newReferenceReadCollections();
    const budget = newReferenceReadBudget();
    for (const source of sources) {
        readBoundedSource({ source, readMetadata, readSource, maximumFileBytes, maximumTotalBytes, budget, collections });
    }
    return finishBoundedReferenceRead({ ...collections, acceptedBytes: budget.acceptedBytes });
}
//# sourceMappingURL=reference-read-bounded.js.map