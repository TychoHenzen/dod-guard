import type { BurstReport, FossilReport } from "./types.js";
/** Serializes the versioned report as one machine-readable JSON document. */
export declare function renderFossilReportJson(report: FossilReport): string;
export declare function candidateFindingCounts(bursts: readonly BurstReport[]): {
    candidateFindingCount: number;
    uniqueCandidatePathCount: number;
};
/** Applies statistics derived from burst findings. */
export declare function finalizeFossilReport(report: FossilReport): FossilReport;
