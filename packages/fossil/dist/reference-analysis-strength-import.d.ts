import type { ParsedReference } from "./types.js";
import type { ReferenceSourceContent } from "./reference-analysis-types.js";
export declare function importReferenceStrength(reference: ParsedReference, source: ReferenceSourceContent): "strong" | "weak";
