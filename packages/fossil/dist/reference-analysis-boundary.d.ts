import type { ReferenceAnalysisResult } from "./reference-analysis-types/reference-analysis-result.js";
import type { ReferenceContainmentBoundary } from "./reference-analysis-types/reference-containment-boundary.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
/** Parses JavaScript references while enforcing the repository boundary. */
export declare function analyzeJavaScriptReferencesWithinBoundary(sources: readonly ReferenceSourceContent[], boundary: ReferenceContainmentBoundary): ReferenceAnalysisResult;
