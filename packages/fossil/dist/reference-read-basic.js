import { addUnreadableReferenceWarning, emptyReferenceGraph, newReferenceReadCollections, sortReferenceReadEvidence } from "./reference-read-support.js";
/** Reads eligible sources without letting one unreadable file stop later parsing work. */
export function readReferenceSources(sources, readSource) {
    const { readableSources, unavailablePaths, warnings } = newReferenceReadCollections();
    for (const source of sources) {
        try {
            readableSources.push({ ...source, content: readSource(source) });
        }
        catch {
            addUnreadableReferenceWarning({ unavailablePaths, warnings, source });
        }
    }
    sortReferenceReadEvidence({ unavailablePaths, warnings });
    return {
        graph: emptyReferenceGraph(unavailablePaths),
        sources: readableSources,
        warnings,
    };
}
//# sourceMappingURL=reference-read-basic.js.map