export interface QualityConfig {
  pathGroups: Record<string, string[]>;
  dependencyDirections: Array<{ from: string; to: string; allowed: boolean }>;
  directTypeLimit: number;
  genericBuckets: string[];
  generatedPaths: string[];
  testPaths: string[];
  lowLevelPathGroups: string[];
  history: { maxFirstParentCommits: number };
}

export const DEFAULT_CONFIG: QualityConfig = {
  pathGroups: {},
  dependencyDirections: [],
  directTypeLimit: 12,
  genericBuckets: ["utils", "common", "helpers", "shared", "misc"],
  generatedPaths: [],
  testPaths: [],
  lowLevelPathGroups: [],
  history: { maxFirstParentCommits: 200 },
};
