import type { QualityConfig } from "./config.js";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { progressValues } from "./refactor-progress-metrics.js";

export function buildProgressMetrics(
  beforeFiles: ArchitectureFileFact[],
  afterFiles: ArchitectureFileFact[],
  config: QualityConfig,
) {
  return progressValues(beforeFiles, afterFiles, config);
}
