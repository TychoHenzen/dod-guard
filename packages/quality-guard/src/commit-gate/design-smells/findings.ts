import type { ArchitectureFileFact } from "../architecture-file-fact.js";
import type { QualityConfig } from "../config.js";
import {
  isProductionArchitecturePath,
  matchesArchitecturePath,
  normalizeArchitecturePath,
} from "../placement.js";
import type { ConfigurationDefaultFact } from "./configuration-default-fact.js";

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
        !(
          markerMatch(chain.root, config.fluentMarkers) ||
          chain.hops.some((hop) => markerMatch(hop, config.fluentMarkers))
        ),
    )
    .map((chain) => ({
      kind: "transitive-navigation" as const,
      path,
      ...chain,
    }));
}

export function findingsFor(file: ArchitectureFileFact, config: QualityConfig) {
  return [
    ...configurationFindings(file, config),
    ...navigationFindings(file, config),
  ];
}

export function findingKey(finding: object): string {
  return JSON.stringify(finding);
}
