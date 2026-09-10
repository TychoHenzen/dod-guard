import type { QualityConfig } from "./config.js";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { buildProgressMetrics } from "./refactor-progress-builder.js";
import type { RefactorProgress } from "./refactor-progress-types.js";

function ownershipIndicator(metrics: ReturnType<typeof buildProgressMetrics>) {
  return {
    status:
      metrics.moves.length > 0 ? ("improved" as const) : ("unchanged" as const),
    before: metrics.beforeOperations,
    after: metrics.afterOperations,
    details: metrics.moves.map(
      (move) => `${move.operation}: ${move.from} -> ${move.to}`,
    ),
  };
}

function dependencyIndicator(metrics: ReturnType<typeof buildProgressMetrics>) {
  return {
    status:
      metrics.reductions.length > 0
        ? "improved"
        : metrics.statusFromCounts(
            metrics.beforeDependencies.size,
            metrics.afterDependencies.size,
          ),
    before: metrics.beforeDependencies.size,
    after: metrics.afterDependencies.size,
    details: metrics.reductions,
  };
}

function countIndicator(
  metrics: ReturnType<typeof buildProgressMetrics>,
  before: number,
  after: number,
) {
  return {
    status: metrics.statusFromCounts(before, after),
    before,
    after,
    details: [],
  };
}

function indicators(
  metrics: ReturnType<typeof buildProgressMetrics>,
): RefactorProgress["indicators"] {
  const placement = countIndicator(
    metrics,
    metrics.beforePressure,
    metrics.afterPressure,
  );
  const publicSurface = countIndicator(
    metrics,
    metrics.beforePublic,
    metrics.afterPublic,
  );
  const compatibilityPaths = countIndicator(
    metrics,
    metrics.beforeCompatibility,
    metrics.afterCompatibility,
  );
  return {
    ownership: ownershipIndicator(metrics),
    dependencyEdges: dependencyIndicator(metrics),
    placement,
    publicSurface,
    compatibilityPaths,
  };
}

export function analyzeRefactorProgress(input: {
  before: ArchitectureFileFact[];
  after: ArchitectureFileFact[];
  affectedPaths: string[];
  config: QualityConfig;
}): RefactorProgress {
  const metrics = buildProgressMetrics(input.before, input.after, input.config);
  const result = indicators(metrics);
  return {
    ownershipMoves: metrics.moves,
    indicators: result,
    hasArchitecturalProgress: Object.values(result).some(
      (indicator) => indicator.status === "improved",
    ),
  };
}

export type { RefactorProgress } from "./refactor-progress-types.js";
