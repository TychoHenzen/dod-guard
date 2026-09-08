import type { AnalysisWarning, ReferenceGraph } from "./types.js";
import type { BoundedReferenceReadResult } from "./reference-analysis-types/bounded-reference-read-result.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";

export function emptyReferenceGraph(unavailablePaths: readonly string[]): ReferenceGraph {
  return {
    edges: [],
    unresolved: [],
    complete: unavailablePaths.length === 0,
    unavailablePaths,
  };
}

export function addReferenceWarning(input: {
  unavailablePaths: string[];
  warnings: AnalysisWarning[];
  source: ReferenceCandidate;
  code: AnalysisWarning["code"];
  message: string;
}): void {
  input.unavailablePaths.push(input.source.path);
  input.warnings.push({ code: input.code, message: input.message, path: input.source.path });
}

export function addUnreadableReferenceWarning(input: {
  unavailablePaths: string[];
  warnings: AnalysisWarning[];
  source: ReferenceCandidate;
}): void {
  addReferenceWarning({
    ...input,
    code: "reference_unreadable",
    message: "Reference source could not be read.",
  });
}

export function sortReferenceReadEvidence(input: {
  unavailablePaths: string[];
  warnings: AnalysisWarning[];
}): void {
  input.unavailablePaths.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  input.warnings.sort((left, right) => {
    const leftPath = left.path ?? "";
    const rightPath = right.path ?? "";
    return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
  });
}

export function newReferenceReadCollections() {
  return { readableSources: [] as ReferenceSourceContent[], unavailablePaths: [] as string[], warnings: [] as AnalysisWarning[] };
}

export function newReferenceReadBudget() {
  return { acceptedBytes: 0, totalLimitReached: false };
}

export function boundedReferenceResult(input: {
  readableSources: ReferenceSourceContent[];
  unavailablePaths: string[];
  warnings: AnalysisWarning[];
  acceptedBytes: number;
}): BoundedReferenceReadResult {
  return {
    graph: emptyReferenceGraph(input.unavailablePaths),
    sources: input.readableSources,
    warnings: input.warnings,
    acceptedBytes: input.acceptedBytes,
  };
}

export function finishBoundedReferenceRead(
  input: Parameters<typeof boundedReferenceResult>[0],
): BoundedReferenceReadResult {
  sortReferenceReadEvidence(input);
  return boundedReferenceResult(input);
}
