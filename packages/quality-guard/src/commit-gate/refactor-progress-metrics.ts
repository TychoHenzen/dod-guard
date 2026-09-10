import type { QualityConfig } from "./config.js";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import {
  compatibilityPathCount,
  directTypePressure,
  publicSurfaceCount,
} from "./refactor-progress-counts.js";
import {
  operations,
  ownershipMoves,
  productionTypes,
} from "./refactor-progress-operations.js";
import {
  dependencyKeys,
  dependencyReduction,
} from "./refactor-progress-dependencies.js";

function statusFromCounts(
  before: number,
  after: number,
): "improved" | "regressed" | "unchanged" {
  if (after < before) return "improved";
  if (after > before) return "regressed";
  return "unchanged";
}

export function progressValues(
  beforeFiles: ArchitectureFileFact[],
  afterFiles: ArchitectureFileFact[],
  config: QualityConfig,
) {
  const before = productionTypes(beforeFiles, config);
  const after = productionTypes(afterFiles, config);
  const moves = ownershipMoves(before, after);
  const beforeDependencies = dependencyKeys(before);
  const afterDependencies = dependencyKeys(after);
  const reductions = dependencyReduction(moves, before, after);
  return {
    before,
    after,
    moves,
    reductions,
    beforeDependencies,
    afterDependencies,
    beforeOperations: operations(before).size,
    afterOperations: operations(after).size,
    beforePressure: directTypePressure(before, config),
    afterPressure: directTypePressure(after, config),
    beforePublic: publicSurfaceCount(before),
    afterPublic: publicSurfaceCount(after),
    beforeCompatibility: compatibilityPathCount(before),
    afterCompatibility: compatibilityPathCount(after),
    statusFromCounts,
  };
}
