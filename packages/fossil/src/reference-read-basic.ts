import type { ReferenceReadResult } from "./reference-analysis-types/reference-read-result.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { ReferenceSourceReader } from "./reference-analysis-types/reference-source-reader.js";
import { addUnreadableReferenceWarning, emptyReferenceGraph, newReferenceReadCollections, sortReferenceReadEvidence } from "./reference-read-support.js";

/** Reads eligible sources without letting one unreadable file stop later parsing work. */
export function readReferenceSources(
  sources: readonly ReferenceCandidate[],
  readSource: ReferenceSourceReader,
): ReferenceReadResult {
  const { readableSources, unavailablePaths, warnings } = newReferenceReadCollections();
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
