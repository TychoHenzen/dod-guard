import type { ParsedReference } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types.js";
export declare function strengthForReference(reference: ParsedReference, sources: readonly ReferenceSourceContent[]): "strong" | "weak";
