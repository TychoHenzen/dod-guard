import type { AnalysisWarning, ReferenceGraph } from "../types.js";
import type { ReferenceSourceContent } from "./reference-source-content.js";
export interface ReferenceReadResult {
    readonly graph: ReferenceGraph;
    readonly sources: readonly ReferenceSourceContent[];
    readonly warnings: readonly AnalysisWarning[];
}
