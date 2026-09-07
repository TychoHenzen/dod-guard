import type { ContentClass } from "./content-class.js";

export function markerClass(
  path: string,
  generatedHeader: boolean,
): ContentClass | undefined {
  if (generatedHeader || matchesGeneratedMarker(path)) return "generated";
  if (matchesTestMarker(path)) return "test";
  if (matchesProductionMarker(path)) return "production";
  return undefined;
}

function matchesGeneratedMarker(path: string): boolean {
  return (
    path
      .split("/")
      .some((part) =>
        /^(dist|target|bin|obj|\.venv|generated|auto-generated)$/iu.test(part),
      ) ||
    /\.g\.(cs|ts)$/iu.test(path) ||
    /(^|\/)(?:generated|auto-generated)\.[^.]+$/iu.test(path) ||
    /(?:^|\/).+\.(?:generated|designer)\.(?:cs|ts|js)$/iu.test(path)
  );
}

function matchesTestMarker(path: string): boolean {
  return (
    path.split("/").some((part) => /^(test|tests|__tests__)$/iu.test(part)) ||
    /(?:^|[._-])(test|spec)\.[^.]+$/iu.test(path) ||
    /(?:^|\/)[^/]*(?:Tests|Test)\.(?:cs|vb)$/iu.test(path) ||
    /(?:^|\/)(?:test_[^/]+|[^/]+_test)\.pyi?$/iu.test(path) ||
    /(?:^|\/)[^/]+_test\.rs$/iu.test(path)
  );
}

function matchesProductionMarker(path: string): boolean {
  return /^(src|lib|app)\//iu.test(path);
}
