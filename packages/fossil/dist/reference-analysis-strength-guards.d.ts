import type { ParsedReference } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types.js";
export declare function guardedReferenceStrength(reference: ParsedReference, source: ReferenceSourceContent): "strong" | "weak";
