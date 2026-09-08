import type { ReferenceRange } from "./reference-analysis-types/reference-range.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";
export declare function fallbackRegions(source: ReferenceSourceContent, view: ReturnType<typeof syntaxView>): ReferenceRange[];
export declare function isInsideFallback(index: number, regions: readonly ReferenceRange[]): boolean;
