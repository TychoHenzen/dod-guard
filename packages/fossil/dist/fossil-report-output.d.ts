import type { BurstReport, FossilReport } from "./types.js";
/** Serializes the versioned report as one machine-readable JSON document. */
export declare function renderFossilReportJson(report: FossilReport): string;
/** Counts burst-path finding records and their unique normalized candidate paths. */
export declare function candidateFindingCounts(bursts: readonly BurstReport[]): {
    candidateFindingCount: number;
    uniqueCandidatePathCount: number;
};
/** Applies the report statistics derived from its burst-path finding records. */
export declare function finalizeFossilReport(report: FossilReport): FossilReport;
