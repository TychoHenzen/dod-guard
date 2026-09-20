import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { analyzeSimilarity } from "./architecture-similarity.js";
import type { QualityConfig } from "./config.js";
import { analyzeCurrentDependencies } from "./dependency-current.js";
import { analyzeEncapsulation } from "./encapsulation.js";
import { analyzeCurrentDesignSmells } from "./design-smells.js";
import { analyzeCurrentPlacement } from "./placement-current.js";

/** Current-state audit used by reports.
 * Commit decisions keep their delta analyzers. */
export function analyzeCurrentArchitecture(
  files: ArchitectureFileFact[],
  config: QualityConfig,
) {
  const paths = files.map((file) => file.path);
  const dependency = analyzeCurrentDependencies(files, config);
  const design = analyzeCurrentDesignSmells(files, config);
  return {
    placement: placementFor(files, config),
    similarity: analyzeSimilarity({
      afterFiles: files,
      affectedPaths: paths,
      config,
    }),
    dependencies: dependency.dependencies,
    cycles: dependency.cycles,
    encapsulation: encapsulationFor(files, paths, config),
    configurableData: design.filter((finding) => finding.kind === "configurable-data"),
    transitiveNavigation: design.filter(
      (finding) => finding.kind === "transitive-navigation",
    ),
  };
}

function placementFor(files: ArchitectureFileFact[], config: QualityConfig) {
  return analyzeCurrentPlacement(
    files.map((file) => ({
      path: file.path,
      types: file.types.map((type) => type.name),
    })),
    config,
  );
}

function encapsulationFor(
  files: ArchitectureFileFact[],
  paths: string[],
  config: QualityConfig,
) {
  return analyzeEncapsulation({
    beforeFiles: [],
    afterFiles: files,
    affectedPaths: paths,
    config,
  }).filter(
    (finding) =>
      finding.kind !== "public-surface-growth" ||
      finding.productionCallers.length === 0,
  );
}
