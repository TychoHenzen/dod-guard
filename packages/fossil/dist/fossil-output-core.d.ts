import type { BurstReport, FossilReport, WorkspaceDebrisFinding } from "./types.js";
/** Presentation modes that control workspace-debris table detail. */
export type WorkspaceDebrisTableMode = "normal" | "verbose";
export type BurstTableMode = "normal" | "verbose";
/** A table row either keeps one finding or summarizes a large ignored directory. */
export type WorkspaceDebrisTableRow = {
    readonly kind: "finding";
    readonly finding: WorkspaceDebrisFinding;
} | {
    readonly kind: "ignored-directory-summary";
    readonly directory: string;
    readonly count: number;
};
/** One typed row in a burst table, kept together in report order. */
export type BurstTableRow = {
    readonly kind: "burst";
    readonly id: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly commitCount: number;
    readonly fileCount: number;
} | {
    readonly kind: "survivor";
    readonly path: string;
} | {
    readonly kind: "finding";
    readonly path: string;
    readonly score: number;
    readonly scoreBasis: "full" | "git-only";
} | {
    readonly kind: "finding-explanation";
    readonly createdInBurst: boolean;
    readonly burstCommits: number;
    readonly postBurstCommits: number;
    readonly referenceAvailability: "complete" | "unavailable";
    readonly strongInboundReferences: number;
    readonly candidateNeighbors: readonly string[];
    readonly liveNeighbors: readonly string[];
};
export interface BurstTableRenderOptions {
    readonly isTty: boolean;
}
export interface CandidateFindingCounts {
    readonly candidateFindingCount: number;
    readonly uniqueCandidatePathCount: number;
}
export declare function terminalSafeText(value: string): string;
/** Produces deterministic burst, survivor, and candidate rows in their required table order. */
export declare function burstTableRows(bursts: readonly BurstReport[], mode?: BurstTableMode): readonly BurstTableRow[];
/** Renders current burst table rows with explicit caller-owned TTY styling control. */
export declare function renderBurstTableRows(rows: readonly BurstTableRow[], { isTty }: BurstTableRenderOptions): string;
/** Serializes the versioned report as one machine-readable JSON document. */
export declare function renderFossilReportJson(report: FossilReport): string;
/** Counts burst-path finding records and their unique normalized candidate paths. */
export declare function candidateFindingCounts(bursts: readonly BurstReport[]): CandidateFindingCounts;
/** Applies the report statistics derived from its burst-path finding records. */
export declare function finalizeFossilReport(report: FossilReport): FossilReport;
/** Produces normal or verbose table rows without changing the underlying debris findings. */
export declare function workspaceDebrisTableRows(findings: readonly WorkspaceDebrisFinding[], mode: WorkspaceDebrisTableMode): readonly WorkspaceDebrisTableRow[];
