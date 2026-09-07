import {
  ProjectPathError,
  type ProjectRoot,
  type SymbolIdentity,
} from "../semantic/api/public-api.js";
import {
  classifyProjectPath,
  matchesDiscoveryFilters,
  type PathClassification,
} from "./classification.js";
import type { ClassificationConfig } from "./classification-config.js";
import type { DiscoveryFilters } from "./discovery-filters.js";
import { isSensitiveProjectPath } from "./sensitive-paths.js";
import {
  hasGeneratedHeader,
  languageForPath,
} from "./source-file-collector.js";

export type FileCandidate = {
  type: "file";
  path: string;
  identity: string;
  classification: PathClassification;
};

function normalizeBackendSymbol(
  root: ProjectRoot,
  symbol: SymbolIdentity,
): SymbolIdentity {
  const portablePath = symbol.location.path
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
  if (!isAbsoluteBackendPath(portablePath)) {
    if (!portablePath || portablePath.split("/").includes(".."))
      throw new ProjectPathError("path_outside_project");
    return { ...symbol, location: { ...symbol.location, path: portablePath } };
  }
  const classified = root.classifyBackendPath(portablePath);
  if ("external" in classified)
    throw new ProjectPathError("path_outside_project");
  return {
    ...symbol,
    location: { ...symbol.location, path: classified.relative_path },
  };
}

function isAbsoluteBackendPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:\//.test(path);
}

export function symbolCandidates(
  root: ProjectRoot,
  config: ClassificationConfig,
  symbols: readonly SymbolIdentity[],
) {
  return symbols
    .map((symbol) => normalizeBackendSymbol(root, symbol))
    .filter((symbol) => !isSensitiveProjectPath(symbol.location.path))
    .map((symbol) => ({
      type: "symbol" as const,
      name: symbol.name,
      path: symbol.location.path,
      kind: symbol.kind,
      identity: symbol.id,
      classification: classifyProjectPath(
        symbol.location.path,
        config,
        hasGeneratedHeader(root, symbol.location.path),
      ),
      language: symbol.language,
    }));
}

export function allowedCandidates(options: {
  root: ProjectRoot;
  filters: DiscoveryFilters;
  files: readonly FileCandidate[];
  symbols: readonly ReturnType<typeof symbolCandidates>[number][];
}) {
  const { root, filters, files, symbols } = options;
  const allCandidates = [...files, ...symbols];
  return allCandidates.filter((candidate) =>
    matchesDiscoveryFilters(candidate.path, candidate.classification, filters, {
      language:
        candidate.type === "symbol"
          ? candidate.language
          : languageForPath(candidate.path),
      ...(candidate.type === "symbol" ? { kind: candidate.kind } : {}),
    }),
  );
}
