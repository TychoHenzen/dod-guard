import type { Burst, GitCommit } from "./types.js";
/** Assembles qualified recursive partitions into deterministic closed burst activity. */
export declare function assembleClosedBursts(fullChronologicalHistory: readonly GitCommit[], closedTemporalClusters: readonly (readonly GitCommit[])[]): Burst[];
