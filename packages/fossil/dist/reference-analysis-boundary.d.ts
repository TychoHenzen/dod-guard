import type { ReferenceAnalysisResult, ReferenceContainmentBoundary, ReferenceSourceContent } from "./reference-analysis-types.js";
/** Parses JavaScript references while enforcing the repository boundary. */
export declare function analyzeJavaScriptReferencesWithinBoundary(sources: readonly ReferenceSourceContent[], boundary: ReferenceContainmentBoundary): ReferenceAnalysisResult;
