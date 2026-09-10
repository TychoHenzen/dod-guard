import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import type { QualityConfig } from "./config.js";
import { analyzeCurrentDependencies } from "./dependency-current.js";
import { analyzeEncapsulation } from "./encapsulation.js";
import { analyzeCurrentPlacement } from "./placement-current.js";

/** Current-state audit used by reports.
 * Commit decisions keep their delta analyzers. */
export function analyzeCurrentArchitecture(
  files: ArchitectureFileFact[],
  config: QualityConfig,
) {
  const paths = files.map((file) => file.path);
  const dependency = analyzeCurrentDependencies(files, config);
  const encapsulation = analyzeEncapsulation({
    beforeFiles: [],
    afterFiles: files,
    affectedPaths: paths,
    config,
  }).filter(
    (finding) =>
      finding.kind !== "public-surface-growth" ||
      finding.productionCallers.length === 0,
  );
  return {
    placement: analyzeCurrentPlacement(
      files.map((file) => ({
        path: file.path,
        types: file.types.map((type) => type.name),
      })),
      config,
    ),
    dependencies: dependency.dependencies,
    cycles: dependency.cycles,
    encapsulation,
  };
}
