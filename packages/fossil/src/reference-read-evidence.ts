import type { AnalysisWarning, ReferenceGraph } from "./types.js";
import type { BoundedReferenceReadResult } from "./reference-analysis-types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types.js";
import { compareText } from "./reference-analysis-paths.js";

export function emptyReferenceGraph(
  unavailablePaths: readonly string[],
): ReferenceGraph {
  return {
    edges: [],
    unresolved: [],
    complete: unavailablePaths.length === 0,
    unavailablePaths,
  };
}

function warningPath(warning: AnalysisWarning): string {
  return warning.path ?? "";
}

function compareWarnings(
  left: AnalysisWarning,
  right: AnalysisWarning,
): number {
  return compareText(warningPath(left), warningPath(right));
}

export function sortReferenceReadEvidence(input: {
  unavailablePaths: string[];
  warnings: AnalysisWarning[];
}): void {
  input.unavailablePaths.sort(compareText);
  input.warnings.sort(compareWarnings);
}

function boundedReferenceResult(input: {
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
