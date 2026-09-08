import { posix } from "node:path";
import type { AnalysisWarning, ParsedReference } from "./types.js";
import type { ReferenceAnalysisResult } from "./reference-analysis-types/reference-analysis-result.js";
import type { ReferenceContainmentBoundary } from "./reference-analysis-types/reference-containment-boundary.js";
import type { ReferenceSourceContent } from "./reference-analysis-types/reference-source-content.js";
import { parsedModuleReferences } from "./reference-analysis-module-parser.js";
import { outsideBoundaryWarning, isOutsideRepositoryPath, pathIsWithin, compareText } from "./reference-analysis-paths.js";
import { referenceGraph } from "./reference-analysis-graph-builder.js";

function needsBoundaryCheck(reference: ParsedReference): boolean {
  return reference.resolution === "unresolved" && Boolean(reference.targetCandidates[0]);
}

function referenceInsideBoundary({ reference, inventory, boundary, warnings }: {
  reference: ParsedReference;
  inventory: ReadonlySet<string>;
  boundary: ReferenceContainmentBoundary;
  warnings: Map<string, AnalysisWarning>;
}): boolean {
  const literalTarget = reference.targetCandidates[0];
  if (isOutsideRepositoryPath(literalTarget)) {
    warnings.set(reference.sourcePath, outsideBoundaryWarning(reference.sourcePath));
    return false;
  }
  const resolvedTarget = reference.targetCandidates.find((candidate) => inventory.has(candidate));
  if (!resolvedTarget) return true;
  const canonicalTarget = boundary.canonicalize(posix.join(boundary.canonicalRepositoryRoot, resolvedTarget));
  return pathIsWithin(boundary.canonicalRepositoryRoot, canonicalTarget);
}

function safeReference({ reference, inventory, boundary, warnings }: {
  reference: ParsedReference;
  inventory: ReadonlySet<string>;
  boundary: ReferenceContainmentBoundary;
  warnings: Map<string, AnalysisWarning>;
}): boolean {
  if (!needsBoundaryCheck(reference)) return true;
  if (referenceInsideBoundary({ reference, inventory, boundary, warnings })) return true;
  warnings.set(reference.sourcePath, outsideBoundaryWarning(reference.sourcePath));
  return false;
}

/** Parses JavaScript references while rejecting relative targets outside the canonical repository boundary. */
export function analyzeJavaScriptReferencesWithinBoundary(
  sources: readonly ReferenceSourceContent[],
  boundary: ReferenceContainmentBoundary,
): ReferenceAnalysisResult {
  const inventory = new Set(sources.map((source) => source.path));
  const warnings = new Map<string, AnalysisWarning>();
  const safeReferences = sources
    .flatMap(parsedModuleReferences)
    .filter((reference) => safeReference({ reference, inventory, boundary, warnings }));
  return {
    graph: referenceGraph(safeReferences, sources),
    warnings: [...warnings.values()].sort((left, right) => compareText(left.path ?? "", right.path ?? "")),
  };
}
