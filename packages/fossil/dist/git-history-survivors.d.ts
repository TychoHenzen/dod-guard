import type { BurstFileActivity } from "./types.js";
export declare function selectAbsoluteSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[];
/** Selects files meeting the positive relative survivor threshold. */
export declare function selectRelativeSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[];
/** Selects files meeting either survivor threshold. */
export declare function selectSurvivors(files: readonly BurstFileActivity[]): BurstFileActivity[];
/** Selects current burst files that meet neither survivor rule. */
export declare function selectFossilCandidates(files: readonly BurstFileActivity[]): BurstFileActivity[];
/** Selects deleted burst paths that meet neither survivor rule. */
export declare function selectDeletedNonSurvivorPaths(files: readonly BurstFileActivity[]): string[];
