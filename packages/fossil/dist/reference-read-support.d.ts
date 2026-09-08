import type { AnalysisWarning, ReferenceGraph } from "./types.js";
import type { BoundedReferenceReadResult } from "./reference-analysis-types/bounded-reference-read-result.js";
import type { ReferenceCandidate } from "./reference-analysis-types/reference-candidate.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
export declare function emptyReferenceGraph(unavailablePaths: readonly string[]): ReferenceGraph;
export declare function addReferenceWarning(input: {
    unavailablePaths: string[];
    warnings: AnalysisWarning[];
    source: ReferenceCandidate;
    code: AnalysisWarning["code"];
    message: string;
}): void;
export declare function addUnreadableReferenceWarning(input: {
    unavailablePaths: string[];
    warnings: AnalysisWarning[];
    source: ReferenceCandidate;
}): void;
export declare function sortReferenceReadEvidence(input: {
    unavailablePaths: string[];
    warnings: AnalysisWarning[];
}): void;
export declare function newReferenceReadCollections(): {
    readableSources: ReferenceSourceContent[];
    unavailablePaths: string[];
    warnings: AnalysisWarning[];
};
export declare function newReferenceReadBudget(): {
    acceptedBytes: number;
    totalLimitReached: boolean;
};
export declare function boundedReferenceResult(input: {
    readableSources: ReferenceSourceContent[];
    unavailablePaths: string[];
    warnings: AnalysisWarning[];
    acceptedBytes: number;
}): BoundedReferenceReadResult;
export declare function finishBoundedReferenceRead(input: Parameters<typeof boundedReferenceResult>[0]): BoundedReferenceReadResult;
