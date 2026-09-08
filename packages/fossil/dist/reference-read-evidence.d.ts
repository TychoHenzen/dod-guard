import type { AnalysisWarning, ReferenceGraph } from "./types.js";
import type { BoundedReferenceReadResult } from "./reference-analysis-types/bounded-reference-read-result.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
export declare function emptyReferenceGraph(unavailablePaths: readonly string[]): ReferenceGraph;
export declare function sortReferenceReadEvidence(input: {
    unavailablePaths: string[];
    warnings: AnalysisWarning[];
}): void;
declare function boundedReferenceResult(input: {
    readableSources: ReferenceSourceContent[];
    unavailablePaths: string[];
    warnings: AnalysisWarning[];
    acceptedBytes: number;
}): BoundedReferenceReadResult;
export declare function finishBoundedReferenceRead(input: Parameters<typeof boundedReferenceResult>[0]): BoundedReferenceReadResult;
export {};
