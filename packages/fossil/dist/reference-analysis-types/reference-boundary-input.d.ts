import type { AnalysisWarning, ParsedReference } from "../types.js";
import type { ReferenceContainmentBoundary } from "./reference-containment.js";
export interface ReferenceBoundaryInput {
    reference: ParsedReference;
    inventory: ReadonlySet<string>;
    boundary: ReferenceContainmentBoundary;
    warnings: Map<string, AnalysisWarning>;
}
