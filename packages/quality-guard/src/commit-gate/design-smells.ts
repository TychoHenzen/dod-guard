import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import type { ConfigurationDefaultFact } from "./configuration-default-fact.js";
import type { QualityConfig } from "./config.js";
import {
  isProductionArchitecturePath,
  matchesArchitecturePath,
  normalizeArchitecturePath,
} from "./placement.js";

type ConfigurationFinding = ConfigurationDefaultFact & {
  kind: "configurable-data";
  path: string;
  group: string;
};

function groupsFor(path: string, config: QualityConfig): string[] {
  return config.lowLevelPathGroups.filter((group) =>
    config.pathGroups[group]?.some((pattern) =>
      matchesArchitecturePath(path, pattern),
    ),
  );
}

function configurationFindings(
  file: ArchitectureFileFact,
  config: QualityConfig,
): ConfigurationFinding[] {
  const path = normalizeArchitecturePath(file.path);
  return groupsFor(path, config).flatMap((group) =>
    (file.configurationDefaults ?? []).map((defaultValue) => ({
      kind: "configurable-data" as const,
      path,
      group,
      ...defaultValue,
    })),
  );
}

function markerMatch(value: string, markers: string[]): boolean {
  const normalized = value.toLowerCase();
  return markers.some((marker) => normalized.includes(marker.toLowerCase()));
}

function navigationFindings(file: ArchitectureFileFact, config: QualityConfig) {
  const path = normalizeArchitecturePath(file.path);
  return (file.transitiveNavigation ?? [])
    .filter(
      (chain) =>
        !markerMatch(chain.root, config.fluentMarkers) &&
        !chain.hops.some((hop) => markerMatch(hop, config.fluentMarkers)),
    )
    .map((chain) => ({
      kind: "transitive-navigation" as const,
      path,
      ...chain,
    }));
}

function key(finding: object): string {
  return JSON.stringify(finding);
}

function findingsFor(file: ArchitectureFileFact, config: QualityConfig) {
  return [...configurationFindings(file, config), ...navigationFindings(file, config)];
}

export function analyzeDesignSmells(input: {
  beforeFiles: ArchitectureFileFact[];
  afterFiles: ArchitectureFileFact[];
  affectedPaths: string[];
  config: QualityConfig;
}) {
  const affected = new Set(input.affectedPaths.map(normalizeArchitecturePath));
  const before = new Set(
    input.beforeFiles.flatMap((file) =>
      findingsFor({ ...file, path: normalizeArchitecturePath(file.path) }, input.config).map(key),
    ),
  );
  return input.afterFiles
    .filter((file) => {
      const path = normalizeArchitecturePath(file.path);
      return affected.has(path) && isProductionArchitecturePath(path, input.config);
    })
    .flatMap((file) => findingsFor(file, input.config).filter((finding) => !before.has(key(finding))))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function analyzeCurrentDesignSmells(
  files: ArchitectureFileFact[],
  config: QualityConfig,
) {
  return analyzeDesignSmells({
    beforeFiles: [],
    afterFiles: files,
    affectedPaths: files.map((file) => file.path),
    config,
  });
}
