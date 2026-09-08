import type { AnalysisWarning } from "./types.js";
import type { ReferenceCandidate, ReferenceSourceContent } from "./reference-analysis-types.js";
export { emptyReferenceGraph, finishBoundedReferenceRead, sortReferenceReadEvidence, } from "./reference-read-evidence.js";
interface ReferenceWarningInput {
    unavailablePaths: string[];
    warnings: AnalysisWarning[];
    source: ReferenceCandidate;
    code: AnalysisWarning["code"];
    message: string;
}
export declare function addReferenceWarning(input: ReferenceWarningInput): void;
export declare function addUnreadableReferenceWarning(input: Pick<ReferenceWarningInput, "unavailablePaths" | "warnings" | "source">): void;
export declare function addBinaryReferenceWarning(input: Pick<ReferenceWarningInput, "unavailablePaths" | "warnings" | "source">): void;
export declare function newReferenceReadCollections(): {
    readableSources: ReferenceSourceContent[];
    unavailablePaths: string[];
    warnings: AnalysisWarning[];
};
export declare function newReferenceReadBudget(): {
    acceptedBytes: number;
    totalLimitReached: boolean;
};
