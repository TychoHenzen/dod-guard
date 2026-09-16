import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import type { assessSimilarity } from "./architecture-similarity-assessment.js";
import type { QualityConfig } from "./config.js";
import {
  isProductionArchitecturePath,
  normalizeArchitecturePath,
} from "./placement-paths.js";

export function changeSets(input: {
  beforeFiles?: ArchitectureFileFact[];
  affectedPaths: string[];
  config: QualityConfig;
}) {
  return {
    before: new Set(
      (input.beforeFiles ?? []).map((file) =>
        normalizeArchitecturePath(file.path),
      ),
    ),
    affected: new Set(
      input.affectedPaths
        .filter((filePath) =>
          isProductionArchitecturePath(filePath, input.config),
        )
        .map(normalizeArchitecturePath),
    ),
  };
}

export function changedOutlier(
  finding: NonNullable<ReturnType<typeof assessSimilarity>>,
  changes: { affected: Set<string>; before: Set<string> },
): NonNullable<ReturnType<typeof assessSimilarity>> | undefined {
  if (finding.kind !== "similarity-outlier") return finding;
  const outliers = finding.outliers.filter(
    (outlier) =>
      changes.affected.has(normalizeArchitecturePath(outlier.path)) &&
      !changes.before.has(normalizeArchitecturePath(outlier.path)),
  );
  return outliers.length > 0 ? { ...finding, outliers } : undefined;
}
