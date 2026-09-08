import type { ParsedReference } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
export declare function parsedCsharpReferences(source: ReferenceSourceContent, currentSources: readonly ReferenceSourceContent[]): ParsedReference[];
