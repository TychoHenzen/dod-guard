import type { NormalizedAnalysisOptions } from "./types.js";
/** Default analysis options. Empty extensions include every extension. */
export declare const DEFAULT_NORMALIZED_ANALYSIS_OPTIONS: NormalizedAnalysisOptions;
/** Validates direct API options and returns fresh collections. */
export declare function validateNormalizedAnalysisOptions(options: unknown): NormalizedAnalysisOptions;
