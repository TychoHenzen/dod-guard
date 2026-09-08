import type { AnalysisWarning, ReferenceGraph } from "./types.js";
import type { BoundedReferenceReadResult } from "./reference-analysis-types/bounded-reference-read-result.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import { compareText } from "./reference-analysis-paths.js";

interface ReferenceWarningInput {
  unavailablePaths: string[];
  warnings: AnalysisWarning[];
  source: ReferenceCandidate;
  code: AnalysisWarning["code"];
  message: string;
}

export function emptyReferenceGraph(unavailablePaths: readonly string[]): ReferenceGraph {
  return {
    edges: [],
    unresolved: [],
    complete: unavailablePaths.length === 0,
    unavailablePaths,
  };
}

export function addReferenceWarning(input: ReferenceWarningInput): void {
  input.unavailablePaths.push(input.source.path);
  input.warnings.push({ code: input.code, message: input.message, path: input.source.path });
}

function addTypedReferenceWarning(input: ReferenceWarningInput): void {
  addReferenceWarning(input);
}

export function addUnreadableReferenceWarning(
  input: Pick<ReferenceWarningInput, "unavailablePaths" | "warnings" | "source">,
): void {
  addTypedReferenceWarning({
    ...input,
    code: "reference_unreadable",
    message: "Reference source could not be read.",
  });
}

export function addBinaryReferenceWarning(
  input: Pick<ReferenceWarningInput, "unavailablePaths" | "warnings" | "source">,
): void {
  addTypedReferenceWarning({
    ...input,
    code: "reference_binary",
    message: "Reference source is binary.",
  });
}

function warningPath(warning: AnalysisWarning): string {
  return warning.path ?? "";
}

function compareWarnings(left: AnalysisWarning, right: AnalysisWarning): number {
  return compareText(warningPath(left), warningPath(right));
}

export function sortReferenceReadEvidence(input: {
  unavailablePaths: string[];
  warnings: AnalysisWarning[];
}): void {
  input.unavailablePaths.sort(compareText);
  input.warnings.sort(compareWarnings);
}

export function newReferenceReadCollections() {
  return { readableSources: [] as ReferenceSourceContent[], unavailablePaths: [] as string[], warnings: [] as AnalysisWarning[] };
}

export function newReferenceReadBudget() {
  return { acceptedBytes: 0, totalLimitReached: false };
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
