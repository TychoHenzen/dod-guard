import { posix } from "node:path";
import type { AnalysisWarning, ParsedReference } from "./types.js";
import type {
  ReferenceAnalysisResult,
  ReferenceBoundaryInput,
  ReferenceContainmentBoundary,
  ReferenceSourceContent,
} from "./reference-analysis-types.js";
import { parsedModuleReferences } from "./reference-analysis-module-parser.js";
import {
  outsideBoundaryWarning,
  isOutsideRepositoryPath,
  pathIsWithin,
  compareText,
} from "./reference-analysis-paths.js";
import { referenceGraph } from "./reference-analysis-graph-builder.js";

function needsBoundaryCheck(reference: ParsedReference): boolean {
  return (
    reference.resolution === "unresolved" &&
    Boolean(reference.targetCandidates[0])
  );
}

function recordOutsideBoundaryWarning(
  warnings: Map<string, AnalysisWarning>,
  sourcePath: string,
): void {
  warnings.set(sourcePath, outsideBoundaryWarning(sourcePath));
}

function referenceInsideBoundary(input: ReferenceBoundaryInput): boolean {
  const { reference, inventory, boundary, warnings } = input;
  const literalTarget = reference.targetCandidates[0];
  if (isOutsideRepositoryPath(literalTarget)) {
    recordOutsideBoundaryWarning(warnings, reference.sourcePath);
    return false;
  }
  const resolvedTarget = reference.targetCandidates.find((candidate) =>
    inventory.has(candidate),
  );
  if (!resolvedTarget) return true;
  const canonicalTarget = boundary.canonicalize(
    posix.join(boundary.canonicalRepositoryRoot, resolvedTarget),
  );
  return pathIsWithin(boundary.canonicalRepositoryRoot, canonicalTarget);
}

function safeReference(input: ReferenceBoundaryInput): boolean {
  const { reference, inventory, boundary, warnings } = input;
  if (!needsBoundaryCheck(reference)) return true;
  if (referenceInsideBoundary({ reference, inventory, boundary, warnings }))
    return true;
  recordOutsideBoundaryWarning(warnings, reference.sourcePath);
  return false;
}

/** Parses JavaScript references while enforcing the repository boundary. */
export function analyzeJavaScriptReferencesWithinBoundary(
  sources: readonly ReferenceSourceContent[],
  boundary: ReferenceContainmentBoundary,
): ReferenceAnalysisResult {
  const inventory = new Set(sources.map((source) => source.path));
  const warnings = new Map<string, AnalysisWarning>();
  const safeReferences = sources
    .flatMap(parsedModuleReferences)
    .filter((reference) =>
      safeReference({ reference, inventory, boundary, warnings }),
    );
  return {
    graph: referenceGraph(safeReferences, sources),
    warnings: [...warnings.values()].sort((left, right) =>
      compareText(left.path ?? "", right.path ?? ""),
    ),
  };
}
