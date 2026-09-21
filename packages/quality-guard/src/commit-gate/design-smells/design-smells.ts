import type { ArchitectureFileFact } from "../architecture-file-fact.js";
import type { QualityConfig } from "../config.js";
import {
  isProductionArchitecturePath,
  normalizeArchitecturePath,
} from "../placement.js";
import { findingKey, findingsFor } from "./findings.js";

export function analyzeDesignSmells(input: {
  beforeFiles: ArchitectureFileFact[];
  afterFiles: ArchitectureFileFact[];
  affectedPaths: string[];
  config: QualityConfig;
}) {
  const affected = new Set(input.affectedPaths.map(normalizeArchitecturePath));
  const before = new Set(
    input.beforeFiles.flatMap((file) =>
      findingsFor(
        { ...file, path: normalizeArchitecturePath(file.path) },
        input.config,
      ).map(findingKey),
    ),
  );
  return input.afterFiles
    .filter((file) => {
      const path = normalizeArchitecturePath(file.path);
      return affected.has(path) && isProductionArchitecturePath(path, input.config);
    })
    .flatMap((file) =>
      findingsFor(file, input.config).filter(
        (finding) => !before.has(findingKey(finding)),
      ),
    )
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
}
