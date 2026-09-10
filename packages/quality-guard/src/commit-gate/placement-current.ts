import * as path from "node:path";
import type { QualityConfig } from "./config.js";
import { typeNames } from "./placement.js";

export function analyzeCurrentPlacement(
  files: Array<{ path: string; types: string[] }>,
  config: QualityConfig,
) {
  const directories = typeNames(files, config);
  return [...directories.entries()]
    .filter(
      ([directory, types]) =>
        config.genericBuckets.includes(
          path.posix.basename(directory).toLowerCase(),
        ) || types.size > config.directTypeLimit,
    )
    .map(([directory, types]) => ({
      kind: config.genericBuckets.includes(
        path.posix.basename(directory).toLowerCase(),
      )
        ? ("generic-bucket" as const)
        : ("flat-accumulation" as const),
      directory,
      typeCount: types.size,
      limit: config.directTypeLimit,
      types: [...types].sort((left, right) => left.localeCompare(right)),
    }))
    .sort(
      (left, right) =>
        left.directory.localeCompare(right.directory) ||
        left.kind.localeCompare(right.kind),
    );
}
