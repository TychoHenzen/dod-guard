import type { QualityConfig } from "./config.js";

export function normalizeArchitecturePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function matchesArchitecturePath(
  filePath: string,
  pattern: string,
): boolean {
  const expression = pattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "@@DOUBLE_STAR@@")
    .replaceAll("*", "[^/]*")
    .replaceAll("@@DOUBLE_STAR@@/", "(?:.*/)?")
    .replaceAll("@@DOUBLE_STAR@@", ".*");
  return new RegExp(`^${expression}$`).test(
    normalizeArchitecturePath(filePath),
  );
}

function isTestPath(filePath: string, declaredPaths: string[]): boolean {
  const normalized = normalizeArchitecturePath(filePath);
  return (
    declaredPaths.some((pattern) =>
      matchesArchitecturePath(normalized, pattern),
    ) ||
    new RegExp(
      String.raw`(?:^|\/)(?:test|tests|__tests__|testing|fixtures|mocks|` +
        String.raw`stubs)(?:\/|$)`,
      "i",
    ).test(normalized) ||
    /(?:\.(?:test|spec)\.|_test\.)[^/]*$/i.test(normalized)
  );
}

export function isProductionArchitecturePath(
  filePath: string,
  config: QualityConfig,
): boolean {
  const normalized = normalizeArchitecturePath(filePath);
  return !(
    config.generatedPaths.some((pattern) =>
      matchesArchitecturePath(normalized, pattern),
    ) || isTestPath(normalized, config.testPaths)
  );
}
