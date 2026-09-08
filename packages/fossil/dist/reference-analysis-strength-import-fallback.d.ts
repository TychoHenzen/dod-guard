import type { ReferenceRange, ReferenceSourceContent } from "./reference-analysis-types.js";
import { syntaxView } from "./reference-analysis-syntax-view.js";
export declare function fallbackRegions(source: ReferenceSourceContent, view: ReturnType<typeof syntaxView>): ReferenceRange[];
export declare function isInsideFallback(index: number, regions: readonly ReferenceRange[]): boolean;
