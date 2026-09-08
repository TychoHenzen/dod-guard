import type { GitCommit } from "./types.js";
/** Retains only clusters whose closed state was established by the caller. */
export declare function retainQualifiedClosedClusters(clusters: readonly (readonly GitCommit[])[]): GitCommit[][];
/** Retains clusters inactive for the full configured gap. */
export declare function retainClosedTemporalClusters(clusters: readonly (readonly GitCommit[])[], analysisTimestampMs: number, gapMilliseconds: number): GitCommit[][];
