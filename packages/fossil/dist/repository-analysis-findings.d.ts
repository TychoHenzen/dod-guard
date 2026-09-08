import type { Burst } from "./types.js";
import type { referenceSources } from "./repository-analysis-references.js";
export declare function buildBurstReports(bursts: readonly Burst[], references: ReturnType<typeof referenceSources>, threshold: number): {
    id: string;
    startTimestampMs: number;
    endTimestampMs: number;
    commitCount: number;
    fileCount: number;
    survivors: import("./types.js").BurstFileActivity[];
    findings: import("./types.js").FossilFinding[];
    deletedPaths: string[];
}[];
