import * as path from "node:path";
import type { QualityConfig } from "./config.js";

export interface ProductionTypeFile {
  path: string;
  types: string[];
}

export interface PlacementFinding {
  kind: "flat-accumulation" | "generic-bucket";
  directory: string;
  addedType: string;
  beforeCount: number;
  afterCount: number;
  limit: number;
}

export function normalizeArchitecturePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function matchesArchitecturePath(filePath: string, pattern: string): boolean {
  const expression = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "@@DOUBLE_STAR@@")
    .replaceAll("*", "[^/]*")
    .replaceAll("@@DOUBLE_STAR@@/", "(?:.*/)?")
    .replaceAll("@@DOUBLE_STAR@@", ".*");
  return new RegExp(`^${expression}$`).test(normalizeArchitecturePath(filePath));
}

function isTestPath(filePath: string, declaredPaths: string[]): boolean {
  const normalized = normalizeArchitecturePath(filePath);
  return (
    declaredPaths.some((pattern) => matchesArchitecturePath(normalized, pattern)) ||
    /(?:^|\/)(?:test|tests|__tests__|testing|fixtures|mocks|stubs)(?:\/|$)/i.test(normalized) ||
    /(?:\.(?:test|spec)\.|_test\.)[^/]*$/i.test(normalized)
  );
}

export function isProductionArchitecturePath(filePath: string, config: QualityConfig): boolean {
  const normalized = normalizeArchitecturePath(filePath);
  return !config.generatedPaths.some((pattern) => matchesArchitecturePath(normalized, pattern)) && !isTestPath(normalized, config.testPaths);
}

function typeNames(files: ProductionTypeFile[], config: QualityConfig): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const file of files) {
    if (!isProductionArchitecturePath(file.path, config)) continue;
    const directory = path.posix.dirname(normalizeArchitecturePath(file.path));
    const names = result.get(directory) ?? new Set<string>();
    for (const name of file.types) names.add(name);
    result.set(directory, names);
  }
  return result;
}

/**
 * Measures only types declared directly beneath each affected directory.
 * The caller supplies base and staged production facts from the shared parser.
 */
export function analyzePlacement(
  beforeFiles: ProductionTypeFile[],
  afterFiles: ProductionTypeFile[],
  affectedPaths: string[],
  config: QualityConfig,
): PlacementFinding[] {
  const before = typeNames(beforeFiles, config);
  const after = typeNames(afterFiles, config);
  const changed = new Set(affectedPaths.map(normalizeArchitecturePath));
  const findings: PlacementFinding[] = [];

  for (const file of afterFiles) {
    const normalized = normalizeArchitecturePath(file.path);
    if (!changed.has(normalized) || !isProductionArchitecturePath(file.path, config)) continue;
    const directory = path.posix.dirname(normalized);
    const previous = before.get(directory) ?? new Set<string>();
    const current = after.get(directory) ?? new Set<string>();
    const beforeCount = previous.size;
    const afterCount = current.size;
    const generic = config.genericBuckets.includes(path.posix.basename(directory).toLowerCase());
    for (const addedType of [...file.types].filter((name) => !previous.has(name)).sort((left, right) => left.localeCompare(right))) {
      if (generic || beforeCount > config.directTypeLimit) {
        findings.push({
          kind: generic ? "generic-bucket" : "flat-accumulation",
          directory,
          addedType,
          beforeCount,
          afterCount,
          limit: config.directTypeLimit,
        });
      }
    }
  }
  return findings.sort(
    (left, right) =>
      left.directory.localeCompare(right.directory) || left.addedType.localeCompare(right.addedType) || left.kind.localeCompare(right.kind),
  );
}
