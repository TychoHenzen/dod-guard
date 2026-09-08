import type { NormalizedAnalysisOptions } from "./types.js";
/** Default analysis options. An empty extension list includes every extension. */
export declare const DEFAULT_NORMALIZED_ANALYSIS_OPTIONS: NormalizedAnalysisOptions;
/** Validates direct API options and returns fresh collections for each analysis. */
export declare function validateNormalizedAnalysisOptions(options: unknown): NormalizedAnalysisOptions;
