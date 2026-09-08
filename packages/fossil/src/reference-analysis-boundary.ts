import { posix } from "node:path";
import type { AnalysisWarning, ReferenceGraph } from "./types.js";
import type { ReferenceAnalysisResult } from "./reference-analysis-types/reference-analysis-result.js";
import type { ReferenceContainmentBoundary } from "./reference-analysis-types/reference-containment-boundary.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import { parsedModuleReferences } from "./reference-analysis-module-parser.js";
import { outsideBoundaryWarning, isOutsideRepositoryPath, pathIsWithin, compareText } from "./reference-analysis-paths.js";
import { referenceGraph } from "./reference-analysis-graph-builder.js";

/** Parses JavaScript references while rejecting relative targets outside the canonical repository boundary. */
export function analyzeJavaScriptReferencesWithinBoundary(
  sources: readonly ReferenceSourceContent[],
  boundary: ReferenceContainmentBoundary,
): ReferenceAnalysisResult {
  const inventory = new Set(sources.map((source) => source.path));
  const warnings = new Map<string, AnalysisWarning>();
  const safeReferences = sources.flatMap(parsedModuleReferences).filter((reference) => {
    if (reference.resolution !== "unresolved" || !reference.targetCandidates[0]) return true;
    const literalTarget = reference.targetCandidates[0];
    if (isOutsideRepositoryPath(literalTarget)) {
      warnings.set(reference.sourcePath, outsideBoundaryWarning(reference.sourcePath));
      return false;
    }
    const resolvedTarget = reference.targetCandidates.find((candidate) => inventory.has(candidate));
    if (!resolvedTarget) return true;
    const canonicalTarget = boundary.canonicalize(posix.join(boundary.canonicalRepositoryRoot, resolvedTarget));
    if (pathIsWithin(boundary.canonicalRepositoryRoot, canonicalTarget)) return true;
    warnings.set(reference.sourcePath, outsideBoundaryWarning(reference.sourcePath));
    return false;
  });
  return {
    graph: referenceGraph(safeReferences, sources),
    warnings: [...warnings.values()].sort((left, right) => compareText(left.path ?? "", right.path ?? "")),
  };
}
