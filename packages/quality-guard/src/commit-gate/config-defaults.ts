export interface QualityConfig {
  pathGroups: Record<string, string[]>;
  dependencyDirections: Array<{ from: string; to: string; allowed: boolean }>;
  directTypeLimit: number;
  genericBuckets: string[];
  generatedPaths: string[];
  excludePaths: string[];
  // Read by the scanner script, not the commit gate; parsed here so both
  // readers accept and reject the same file.
  registeredAttributes: string[];
  testPaths: string[];
  lowLevelPathGroups: string[];
  fluentMarkers: string[];
  history: { maxFirstParentCommits: number };
}

export const DEFAULT_CONFIG: QualityConfig = {
  pathGroups: {},
  dependencyDirections: [],
  directTypeLimit: 12,
  genericBuckets: ["utils", "common", "helpers", "shared", "misc"],
  generatedPaths: [],
  excludePaths: [],
  registeredAttributes: [],
  testPaths: [],
  lowLevelPathGroups: [],
  fluentMarkers: ["builder", "fluent", "pipeline", "query"],
  history: { maxFirstParentCommits: 200 },
};
