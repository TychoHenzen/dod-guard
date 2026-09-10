import * as path from "node:path";
import type { QualityConfig } from "./config.js";
import { findingsForFile } from "./placement-findings.js";
import {
  isProductionArchitecturePath,
  normalizeArchitecturePath,
} from "./placement-paths.js";

export function typeNames(
  files: Array<{ path: string; types: string[] }>,
  config: QualityConfig,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const file of files.filter((item) =>
    isProductionArchitecturePath(item.path, config),
  ))
    addTypes(result, file);
  return result;
}

function addTypes(
  result: Map<string, Set<string>>,
  file: { path: string; types: string[] },
): void {
  const directory = path.posix.dirname(normalizeArchitecturePath(file.path));
  const names = result.get(directory) ?? new Set<string>();
  for (const name of file.types) names.add(name);
  result.set(directory, names);
}

/** Measures only types declared directly beneath each affected directory. */
export function analyzePlacement(input: {
  beforeFiles: Array<{ path: string; types: string[] }>;
  afterFiles: Array<{ path: string; types: string[] }>;
  affectedPaths: string[];
  config: QualityConfig;
}) {
  const before = typeNames(input.beforeFiles, input.config);
  const after = typeNames(input.afterFiles, input.config);
  const changed = new Set(input.affectedPaths.map(normalizeArchitecturePath));
  const findings = input.afterFiles.flatMap((file) =>
    findingsForFile({ file, before, after, changed, config: input.config }),
  );
  return findings.sort(
    (left, right) =>
      left.directory.localeCompare(right.directory) ||
      left.addedType.localeCompare(right.addedType) ||
      left.kind.localeCompare(right.kind),
  );
}
