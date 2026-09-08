import type {
  ReferenceCandidate,
  ReferenceReadResult,
  ReferenceSourceReader,
} from "./reference-analysis-types.js";
import {
  addUnreadableReferenceWarning,
  emptyReferenceGraph,
  newReferenceReadCollections,
  sortReferenceReadEvidence,
} from "./reference-read-support.js";

/** Reads eligible sources without stopping on one unreadable file. */
export function readReferenceSources(
  sources: readonly ReferenceCandidate[],
  readSource: ReferenceSourceReader,
): ReferenceReadResult {
  const { readableSources, unavailablePaths, warnings } =
    newReferenceReadCollections();
  for (const source of sources) {
    try {
      readableSources.push({ ...source, content: readSource(source) });
    } catch {
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
