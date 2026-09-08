import type { ParsedReference, ReferenceGraph } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
export declare function referenceGraph(parsed: readonly ParsedReference[], sources: readonly ReferenceSourceContent[]): ReferenceGraph;
