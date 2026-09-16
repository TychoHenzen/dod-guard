import * as path from "node:path";
import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { assessSimilarity } from "./architecture-similarity-assessment.js";
import {
  changedOutlier,
  changeSets,
} from "./architecture-similarity-changes.js";
import type { QualityConfig } from "./config.js";
import {
  isProductionArchitecturePath,
  normalizeArchitecturePath,
} from "./placement-paths.js";

function affectedDirectories(input: {
  affectedPaths: string[];
  config: QualityConfig;
}): Set<string> {
  return new Set(
    input.affectedPaths
      .filter((filePath) =>
        isProductionArchitecturePath(filePath, input.config),
      )
      .map((filePath) =>
        path.posix.dirname(normalizeArchitecturePath(filePath)),
      ),
  );
}

function filesByDirectory(input: {
  afterFiles: ArchitectureFileFact[];
  affected: Set<string>;
  config: QualityConfig;
}): Map<string, ArchitectureFileFact[]> {
  const directories = new Map<string, ArchitectureFileFact[]>();
  for (const file of input.afterFiles.filter((candidate) =>
    isEligible(candidate, input),
  )) {
    const directory = path.posix.dirname(normalizeArchitecturePath(file.path));
    const files = directories.get(directory) ?? [];
    files.push(file);
    directories.set(directory, files);
  }
  return directories;
}

function isEligible(
  file: ArchitectureFileFact,
  input: { affected: Set<string>; config: QualityConfig },
): boolean {
  const normalized = normalizeArchitecturePath(file.path);
  return (
    isProductionArchitecturePath(normalized, input.config) &&
    input.affected.has(path.posix.dirname(normalized))
  );
}

export function analyzeSimilarity(input: {
  beforeFiles?: ArchitectureFileFact[];
  afterFiles: ArchitectureFileFact[];
  affectedPaths: string[];
  config: QualityConfig;
}): Array<NonNullable<ReturnType<typeof assessSimilarity>>> {
  const changes = changeSets(input);
  const directories = filesByDirectory({
    afterFiles: input.afterFiles,
    affected: affectedDirectories(input),
    config: input.config,
  });
  return [...directories.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([directory, files]) => {
      const finding = assessSimilarity(
        directory,
        files.sort((left, right) => left.path.localeCompare(right.path)),
      );
      const changed = finding && changedOutlier(finding, changes);
      return changed ? [changed] : [];
    });
}
