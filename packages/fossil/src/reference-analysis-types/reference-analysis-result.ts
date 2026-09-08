import type { AnalysisWarning, ReferenceGraph } from "../types.js";

export interface ReferenceAnalysisResult {
  readonly graph: ReferenceGraph;
  readonly warnings: readonly AnalysisWarning[];
}
